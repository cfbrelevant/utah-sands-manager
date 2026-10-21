-- Prerequisite: supabase/schema.sql and owner-authenticated properties.
-- Do not enable rent webhooks without first integrating a trusted, server-created
-- PaymentIntent creation flow that registers the binding before charging.
-- Webhooks are NEVER assigned to a property from payer-editable metadata.
create table if not exists public.stripe_payment_bindings (
  payment_intent_id text primary key check (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  property_id uuid not null references public.properties(id) on delete restrict,
  expected_amount_cents bigint not null check (expected_amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  created_at timestamptz not null default now()
);
create index if not exists stripe_binding_property_idx
  on public.stripe_payment_bindings(property_id);
alter table public.stripe_payment_bindings enable row level security;
revoke all on public.stripe_payment_bindings from public, anon, authenticated;

create table if not exists public.rent_payments (
  payment_intent_id text primary key references public.stripe_payment_bindings(payment_intent_id)
    on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  received_cents bigint not null default 0 check (received_cents >= 0),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  currency text not null default 'usd' check (currency = 'usd'),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists rent_payments_property_idx
  on public.rent_payments(property_id, confirmed_at desc);
alter table public.rent_payments enable row level security;
revoke all on public.rent_payments from public, anon, authenticated;
grant select on public.rent_payments to authenticated;
create policy "owners read their own rent ledger" on public.rent_payments
  for select to authenticated using (exists (
    select 1 from public.properties p
    where p.id = property_id and p.owner_id = (select auth.uid())
  ));

-- Stripe-signed event processing is isolated in one DB transaction.
-- Refund snapshots carry cumulative amount_refunded for the single charge;
-- greatest() means old/out-of-order snapshots cannot reduce refunded total.
-- Returns only safe routing data; never customer or payment credentials.
create or replace function public.record_stripe_rent_event(
  p_event_id text,
  p_payment_intent_id text,
  p_event_kind text,
  p_amount_cents bigint,
  p_currency text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_expected bigint;
  v_previous_received bigint;
  v_previous_refunded bigint;
  v_new_refunded bigint;
  v_received bigint;
  v_recorded text;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$'
    or p_event_kind not in ('succeeded', 'refunded')
    or p_currency <> 'usd'
    or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_payment_event';
  end if;
  select b.property_id, b.expected_amount_cents
    into v_property, v_expected
    from public.stripe_payment_bindings b
    where b.payment_intent_id = p_payment_intent_id;
  if v_property is null then
    raise exception 'payment_not_registered';
  end if;
  if p_event_kind = 'succeeded' and p_amount_cents <> v_expected then
    raise exception 'payment_amount_mismatch';
  end if;
  if p_event_kind = 'refunded' and p_amount_cents > v_expected then
    raise exception 'refund_amount_mismatch';
  end if;

  -- Lock the immutable event id; retries cannot add multiple activity items.
  insert into public.webhook_receipts(provider,event_id)
    values('stripe',p_event_id)
    on conflict do nothing;
  if not found then
    return jsonb_build_object('recorded', false);
  end if;

  insert into public.rent_payments(payment_intent_id,property_id)
    values(p_payment_intent_id,v_property)
    on conflict do nothing;

  select received_cents, refunded_cents into v_previous_received, v_previous_refunded
    from public.rent_payments where payment_intent_id = p_payment_intent_id
    for update;
  if p_event_kind = 'succeeded' then
    if v_previous_received = 0 then
      update public.rent_payments
        set received_cents = p_amount_cents, confirmed_at = now(), updated_at = now()
        where payment_intent_id = p_payment_intent_id;
      insert into public.activity_events(
        property_id,kind,title,detail,status,amount_cents,source,source_event_id,needs_attention
      ) values (
        v_property,'payment','Rent payment confirmed',
        'Stripe payment succeeded; bank payout is separate',
        'completed',p_amount_cents,'stripe',p_event_id,false
      );
      v_recorded := 'received';
    end if;
  else
    v_new_refunded := greatest(v_previous_refunded,p_amount_cents);
    if v_new_refunded > v_previous_refunded then
      update public.rent_payments
        set refunded_cents = v_new_refunded, updated_at = now()
        where payment_intent_id = p_payment_intent_id;
      insert into public.activity_events(
        property_id,kind,title,detail,status,amount_cents,source,source_event_id,needs_attention
      ) values (
        v_property,'payment','Rent refund recorded',
        'A payment was partially or fully refunded; review the transaction',
        'refunded',v_new_refunded-v_previous_refunded,'stripe',p_event_id,true
      );
      v_recorded := 'refunded';
    end if;
  end if;
  return jsonb_build_object(
    'recorded', v_recorded is not null,
    'kind', coalesce(v_recorded,'unchanged'),
    'property_id', v_property
  );
end;
$$;
revoke all on function public.record_stripe_rent_event(text,text,text,bigint,text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_rent_event(text,text,text,bigint,text)
  to service_role;
-- Caveat: net received is not a bank settlement or reconciled accounting
-- balance; fees, disputes/chargebacks and other adjustments are not included.
