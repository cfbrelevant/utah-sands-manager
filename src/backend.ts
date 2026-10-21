import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Activity, Property, RentLedgerEntry } from './domain';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured = Boolean(url && publishableKey);
export const supabase = backendConfigured
  ? createClient(url!, publishableKey!, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export async function loadOwnerData(ownerId: string): Promise<{ properties: Property[]; events: Activity[]; rentLedger: RentLedgerEntry[] }> {
  if (!supabase) throw new Error('Backend is not configured.');
  const { data: properties, error } = await supabase.from('properties')
    .select('id,name,address,location,host,state')
    .eq('owner_id', ownerId).order('created_at');
  if (error) throw error;
  const safeProperties = (properties ?? []) as Property[];
  if (!safeProperties.length) return { properties: [], events: [], rentLedger: [] };
  const { data: events, error: eventsError } = await supabase.from('activity_events')
    .select('id,property_id,kind,title,detail,status,amount_cents,needs_attention,seen_at,occurred_at,resident_submission_id,inbound_email_id')
    .in('property_id', safeProperties.map(p => p.id))
    .order('occurred_at', { ascending: false }).limit(100);
  if (eventsError) throw eventsError;
  const requestIds = (events ?? []).map(e => e.resident_submission_id).filter((id): id is string => !!id);
  const { data: submissions, error: submissionError } = requestIds.length
    ? await supabase.from('resident_submissions')
        .select('id,sender_name,sender_email,subject,message,status')
        .in('id', requestIds)
    : { data: [], error: null };
  if (submissionError) throw submissionError;
  const byRequest = new Map((submissions ?? []).map(item => [item.id, item]));
  const emailIds = (events ?? []).map(e => e.inbound_email_id).filter((id): id is string => !!id);
  const { data: incoming, error: incomingError } = emailIds.length
    ? await supabase.from('inbound_email_records')
        .select('id,recipient,envelope_sender,subject')
        .in('id', emailIds)
    : { data: [], error: null };
  if (incomingError) throw incomingError;
  const byEmail = new Map((incoming ?? []).map(item => [item.id, item]));
  const { data: rentRows, error: rentError } = await supabase.from('rent_payments')
    .select('payment_intent_id,property_id,received_cents,refunded_cents,currency,confirmed_at')
    .in('property_id', safeProperties.map(p => p.id))
    .limit(1000);
  if (rentError) throw rentError;
  return {
    properties: safeProperties,
    rentLedger: (rentRows ?? []).map(row => ({
      paymentIntentId: row.payment_intent_id,
      propertyId: row.property_id,
      receivedCents: row.received_cents,
      refundedCents: row.refunded_cents,
      currency: row.currency as 'usd',
      confirmedAt: row.confirmed_at,
    })),
    events: (events ?? []).map(e => ({
      id: e.id,
      propertyId: e.property_id,
      kind: e.kind as Activity['kind'],
      title: e.title,
      detail: e.detail,
      status: e.status,
      time: new Date(e.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amountCents: e.amount_cents ?? undefined,
      needsAttention: Boolean(e.needs_attention),
      unread: !e.seen_at,
      origin: 'verified' as const,
      emailRecord: e.inbound_email_id && byEmail.has(e.inbound_email_id)
        ? {
            recipient: byEmail.get(e.inbound_email_id)!.recipient,
            sender: byEmail.get(e.inbound_email_id)!.envelope_sender,
            subject: byEmail.get(e.inbound_email_id)!.subject,
          } : undefined,
      submission: e.resident_submission_id && byRequest.has(e.resident_submission_id)
        ? {
            senderName: byRequest.get(e.resident_submission_id)!.sender_name,
            senderEmail: byRequest.get(e.resident_submission_id)!.sender_email,
            subject: byRequest.get(e.resident_submission_id)!.subject,
            message: byRequest.get(e.resident_submission_id)!.message,
            status: byRequest.get(e.resident_submission_id)!.status,
          } : undefined,
    })),
  };
}

export async function addOwnedProperty(ownerId: string, property: Omit<Property, 'id'>): Promise<void> {
  if (!supabase) throw new Error('Backend is not configured.');
  const { error } = await supabase.from('properties').insert({ ...property, owner_id: ownerId });
  if (error) throw error;
}

export async function markEventSeen(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('activity_events').update({ seen_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function savePreferences(ownerId: string, preferences: {
  payment: boolean; message: boolean; maintenance: boolean; inspection: boolean;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('owner_preferences').upsert({
    owner_id: ownerId,
    alert_payments: preferences.payment,
    alert_messages: preferences.message,
    alert_maintenance: preferences.maintenance,
    alert_inspections: preferences.inspection,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadPreferences(ownerId: string): Promise<{
  payment: boolean; message: boolean; maintenance: boolean; inspection: boolean;
}> {
  if (!supabase) throw new Error('Backend is not configured.');
  const { data, error } = await supabase.from('owner_preferences')
    .select('alert_payments,alert_messages,alert_maintenance,alert_inspections')
    .eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  return {
    payment: data?.alert_payments ?? true,
    message: data?.alert_messages ?? true,
    maintenance: data?.alert_maintenance ?? true,
    inspection: data?.alert_inspections ?? false,
  };
}
