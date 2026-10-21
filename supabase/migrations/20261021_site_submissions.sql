-- Apply AFTER supabase/schema.sql in a secured Supabase project.
-- Forms are public, but writes are performed ONLY by the trusted Edge Function.
create table if not exists public.resident_submissions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_submission_id uuid not null,
  kind text not null check (kind in ('inquiry', 'maintenance')),
  sender_name text not null check (length(sender_name) between 2 and 100),
  sender_email text not null,
  subject text not null check (length(subject) between 3 and 140),
  message text not null check (length(message) between 10 and 3000),
  status text not null default 'unverified'
    check (status in ('unverified', 'confirmed', 'resolved', 'spam')),
  created_at timestamptz not null default now(),
  unique (property_id, client_submission_id)
);
create index if not exists resident_submissions_property_idx
  on public.resident_submissions (property_id, created_at desc);
alter table public.resident_submissions enable row level security;
revoke all on public.resident_submissions from public, anon, authenticated;
grant select on public.resident_submissions to authenticated;
create policy "owners read their property submissions"
  on public.resident_submissions for select to authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = property_id and p.owner_id = (select auth.uid())
  ));

alter table public.activity_events
  add column if not exists resident_submission_id uuid
    references public.resident_submissions(id) on delete set null;

create table if not exists public.site_submission_limits (
  property_id uuid not null references public.properties(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  hour_bucket timestamptz not null,
  attempts integer not null default 1,
  primary key (property_id, fingerprint, hour_bucket)
);
alter table public.site_submission_limits enable row level security;
revoke all on public.site_submission_limits from public, anon, authenticated;

-- The Edge Function calls this via service_role, and nothing is exposed
-- to anonymous or signed-in client roles. All inserts are a single transaction.
create or replace function public.record_site_submission(
  p_host text,
  p_kind text,
  p_name text,
  p_email text,
  p_subject text,
  p_message text,
  p_client_submission_id uuid,
  p_fingerprint text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_attempts integer;
  v_submission uuid;
begin
  select p.id into v_property from public.properties p
  where p.host = p_host and p.state = 'active' and p.verified_at is not null;
  if v_property is null then
    raise exception 'not_accepting_requests';
  end if;
  if p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_kind not in ('inquiry', 'maintenance')
    or length(p_name) not between 2 and 100
    or length(p_email) not between 5 and 254
    or length(p_subject) not between 3 and 140
    or length(p_message) not between 10 and 3000 then
    raise exception 'invalid_submission';
  end if;

  -- Existing idempotent submissions should not consume an additional slot.
  if exists (
    select 1 from public.resident_submissions s
    where s.property_id = v_property
      and s.client_submission_id = p_client_submission_id
  ) then return true; end if;

  insert into public.site_submission_limits (property_id, fingerprint, hour_bucket, attempts)
  values (v_property, p_fingerprint, date_trunc('hour', now()), 1)
  on conflict (property_id, fingerprint, hour_bucket)
    do update set attempts = public.site_submission_limits.attempts + 1
    where public.site_submission_limits.attempts < 5
  returning attempts into v_attempts;
  if v_attempts is null then raise exception 'rate_limited'; end if;

  insert into public.resident_submissions (
    property_id, client_submission_id, kind, sender_name,
    sender_email, subject, message
  ) values (
    v_property, p_client_submission_id, p_kind, p_name, p_email, p_subject, p_message
  )
  on conflict (property_id, client_submission_id) do nothing
  returning id into v_submission;

  if v_submission is not null then
    insert into public.activity_events (
      property_id, kind, title, detail, status, source, source_event_id,
      needs_attention, resident_submission_id
    ) values (
      v_property,
      case when p_kind = 'inquiry' then 'message' else 'maintenance' end,
      case when p_kind = 'inquiry' then 'New rental inquiry' else 'New maintenance report' end,
      case when p_kind = 'inquiry' then 'Open to review the inquiry'
           else 'Unverified sender — confirm before acting' end,
      'new', 'website', 'site-request:' || v_submission::text, true, v_submission
    );
  end if;
  return true;
end;
$$;
-- Definer function in an exposed schema is safe ONLY with these restrictive grants.
revoke all on function public.record_site_submission(
  text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_site_submission(
  text, text, text, text, text, text, uuid, text
) to service_role;
-- Periodically delete old rate-limit buckets; see integration guide.
