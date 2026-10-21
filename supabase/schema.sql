-- Utah Sands Manager: foundation schema for a NEW Supabase project.
-- Review and run once. No demo data or account credentials are inserted.
-- Stripe/inbox/maintenance events MUST be inserted by trusted server functions,
-- after verifying the sender and property; never from a public mobile client.

create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address text not null check (char_length(address) between 1 and 240),
  location text not null default '',
  host text not null unique
    check (host = lower(host) and
      (host = 'utahsands.com' or host ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.utahsands\.com$')),
  state text not null default 'planned' check (state in ('planned', 'active', 'archived')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists properties_owner_idx on public.properties (owner_id);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  kind text not null check (kind in ('payment', 'message', 'maintenance', 'inspection', 'lease')),
  title text not null check (char_length(title) between 1 and 180),
  detail text not null default '',
  status text not null,
  amount_cents bigint check (amount_cents >= 0),
  origin text not null default 'verified' check (origin = 'verified'),
  source text not null check (source in ('stripe', 'email', 'website', 'system')),
  source_event_id text not null check (char_length(source_event_id) > 0),
  needs_attention boolean not null default false,
  seen_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_event_id)
);
create index if not exists activity_property_recent_idx
  on public.activity_events(property_id, occurred_at desc);

create table if not exists public.owner_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique check (char_length(expo_push_token) between 15 and 255),
  updated_at timestamptz not null default now()
);
create index if not exists owner_devices_owner_idx on public.owner_devices(owner_id);

create table if not exists public.owner_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  alert_payments boolean not null default true,
  alert_messages boolean not null default true,
  alert_maintenance boolean not null default true,
  alert_inspections boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.properties enable row level security;
alter table public.activity_events enable row level security;
alter table public.owner_devices enable row level security;
alter table public.owner_preferences enable row level security;

-- Restrict client-facing privileges. RLS additionally checks ownership.
revoke all on public.properties, public.activity_events,
  public.owner_devices, public.owner_preferences from anon, authenticated;
grant select, insert, update on public.properties to authenticated;
grant select, update(seen_at) on public.activity_events to authenticated;
grant select, insert, update, delete on public.owner_devices to authenticated;
grant select, insert, update on public.owner_preferences to authenticated;

create policy "owners read own properties" on public.properties
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create own properties" on public.properties
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update own properties" on public.properties
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners read own activity" on public.activity_events
  for select to authenticated using (exists (
    select 1 from public.properties p
    where p.id = property_id and p.owner_id = (select auth.uid())
  ));
create policy "owners may only mark own events seen" on public.activity_events
  for update to authenticated using (exists (
    select 1 from public.properties p
    where p.id = property_id and p.owner_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.properties p
    where p.id = property_id and p.owner_id = (select auth.uid())
  ));
-- Only column seen_at is updateable by authenticated; verified fields are immutable to clients.

create policy "owners read own devices" on public.owner_devices
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners register own devices" on public.owner_devices
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update own devices" on public.owner_devices
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "owners delete own devices" on public.owner_devices
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "owners read own preferences" on public.owner_preferences
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create own preferences" on public.owner_preferences
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update own preferences" on public.owner_preferences
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Backend-only webhook deduplication; no client access.
create table if not exists public.webhook_receipts (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
alter table public.webhook_receipts enable row level security;
revoke all on public.webhook_receipts from anon, authenticated;
