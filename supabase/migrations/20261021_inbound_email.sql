-- Metadata-only inbound email: raw email body stays in the forwarding inbox.
-- Apply after base schema. All routes and aliases are server verified manually.
create table if not exists public.property_inboxes (
  address text primary key check (address = lower(address)
    and address ~ '^[a-z0-9._+\-]+@([a-z0-9\-]+\.)*utahsands\.com$'),
  property_id uuid not null references public.properties(id) on delete restrict,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.property_inboxes enable row level security;
revoke all on public.property_inboxes from public, anon, authenticated;
-- Not writable by a mobile client. The server must first verify domain+route.
create table if not exists public.inbound_email_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  recipient text not null,
  envelope_sender text not null,
  subject text not null,
  message_key text not null unique check (message_key ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now()
);
create index if not exists inbound_email_property_idx
  on public.inbound_email_records(property_id,received_at desc);
alter table public.inbound_email_records enable row level security;
revoke all on public.inbound_email_records from public, anon, authenticated;
grant select on public.inbound_email_records to authenticated;
create policy "owners see only own inbound email metadata" on public.inbound_email_records
  for select to authenticated using (exists (
    select 1 from public.properties p where p.id = property_id
    and p.owner_id = (select auth.uid())
  ));
alter table public.activity_events
  add column if not exists inbound_email_id uuid
    references public.inbound_email_records(id) on delete set null;

create or replace function public.record_inbound_email(
  p_recipient text, p_sender text, p_subject text, p_message_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_property uuid; v_new_id uuid;
begin
  if p_recipient <> lower(p_recipient)
    or p_message_key !~ '^[a-f0-9]{64}$'
    or length(p_sender) not between 3 and 254
    or length(p_subject) > 180 then
    raise exception 'invalid_email_metadata';
  end if;
  select a.property_id into v_property from public.property_inboxes a
    join public.properties p on p.id = a.property_id
    where a.address = p_recipient and a.verified_at is not null
      and p.state = 'active' and p.verified_at is not null;
  if v_property is null then raise exception 'unregistered_email_route'; end if;

  insert into public.inbound_email_records (
    property_id,recipient,envelope_sender,subject,message_key
  ) values (
    v_property,p_recipient,p_sender,p_subject,p_message_key
  ) on conflict (message_key) do nothing returning id into v_new_id;
  if v_new_id is null then return jsonb_build_object('recorded',false); end if;
  insert into public.activity_events (
    property_id,kind,title,detail,status,source,source_event_id,
    needs_attention,inbound_email_id
  ) values (
    v_property,'message','New property email',
    'Email forwarded to your inbox; open for sender and subject',
    'new','email',p_message_key,true,v_new_id
  );
  return jsonb_build_object('recorded',true,'property_id',v_property);
end;
$$;
revoke all on function public.record_inbound_email(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_inbound_email(text,text,text,text)
  to service_role;
