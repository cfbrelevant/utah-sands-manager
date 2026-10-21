import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView, StatusBar, View, Text, ScrollView, Pressable, ActivityIndicator,
  TextInput, StyleSheet, Platform, KeyboardAvoidingView, RefreshControl, AppState
} from 'react-native';
import {
  Activity, ActivityKind, KindFilter, Property, normalizeUtahSandsHost,
  activitiesFor, attentionCount, unseenCount, formatUSD, sumRecordedPayments
} from './src/domain';
import { ORIGINAL_PROPERTY, SAMPLE_EVENTS } from './src/sample';
import type { Session } from '@supabase/supabase-js';
import { supabase, backendConfigured, loadOwnerData, markEventSeen, addOwnedProperty, savePreferences, loadPreferences } from './src/backend';
import { registerOwnerDevice } from './src/push';

type Tab = 'Home' | 'Activity' | 'Properties' | 'Settings';
const INK = '#26342F';
const MUTED = '#68746C';
const GREEN = '#315345';
const LIGHT = '#F5F6F2';
const PAPER = '#FFFFFF';
const LINE = '#E5E9E2';
const AMBER = '#946C35';

const kinds: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'payment', label: 'Payments' },
  { value: 'message', label: 'Messages' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inspection', label: 'Inspections' },
];

const kindGlyph: Record<ActivityKind, string> = {
  payment: '$', message: '✉', maintenance: '⚒', inspection: '✓', lease: '▤'
};

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.pill, selected && styles.pillSelected]}>
    <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{label}</Text>
  </Pressable>;
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return <View style={styles.heading}>
    <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
    <Text style={styles.pageTitle}>{title}</Text>
    {subtitle ? <Text style={styles.subheading}>{subtitle}</Text> : null}
  </View>;
}

function Metric({ title, value, help }: { title: string; value: string; help: string }) {
  return <View style={styles.metric}>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricHelp}>{help}</Text>
  </View>;
}

function ActivityRow({ event, name, onRead }: { event: Activity; name: string; onRead: () => void }) {
  return <Pressable accessibilityRole="button"
    accessibilityLabel={event.title + (event.unread ? ', mark as read' : ', read')}
    onPress={onRead} style={styles.activityRow}>
    <View style={styles.glyph}><Text style={styles.glyphText}>{kindGlyph[event.kind]}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.rowBetween}>
        <Text numberOfLines={1} style={styles.activityTitle}>{event.title}</Text>
        {event.unread ? <View style={styles.unreadDot} /> : null}
      </View>
      <Text style={styles.activityDetail}>{event.detail}</Text>
      <Text style={styles.activityMeta}>{name} · {event.time}</Text>
    </View>
  </Pressable>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Home');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!backendConfigured);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState('Not registered');
  const [properties, setProperties] = useState<Property[]>(backendConfigured ? [] : [ORIGINAL_PROPERTY]);
  const [events, setEvents] = useState<Activity[]>(backendConfigured ? [] : SAMPLE_EVENTS);
  const [propertyScope, setPropertyScope] = useState('all');
  const [filter, setFilter] = useState<KindFilter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newHost, setNewHost] = useState('');
  const [inputError, setInputError] = useState('');
  const [notices, setNotices] = useState({ payment: true, message: true, maintenance: true, inspection: false });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setAuthReady(true); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function refreshOwner() {
    if (!backendConfigured || !session?.user.id) return;
    setRefreshing(true);
    try {
      const next = await loadOwnerData(session.user.id);
      setProperties(next.properties);
      setEvents(next.events);
      setPropertyScope(old => (old === 'all' || next.properties.some(p => p.id === old)) ? old : 'all');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not load owner data.');
    } finally { setRefreshing(false); }
  }

  useEffect(() => {
    if (session?.user.id) {
      void refreshOwner();
      void loadPreferences(session.user.id).then(setNotices)
        .catch(error => setToast(String(error)));
    } else if (backendConfigured) { setProperties([]); setEvents([]); }
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshOwner();
    });
    return () => subscription.remove();
  }, [session?.user.id]);

  async function signIn() {
    if (!supabase) return;
    setAuthBusy(true); setAuthError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setAuthBusy(false); setPassword('');
    }
  }

  const selected = properties.find(p => p.id === propertyScope);
  const scopeName = selected?.name ?? 'All properties';
  const currentEvents = useMemo(() => activitiesFor(events, propertyScope, filter), [events, propertyScope, filter]);
  const summaryEvents = useMemo(() => activitiesFor(events, propertyScope, 'all'), [events, propertyScope]);
  const collected = sumRecordedPayments(events, propertyScope);
  const needsAttention = attentionCount(events, propertyScope);
  const unread = unseenCount(events, propertyScope);

  function markRead(id: string) {
    setEvents(old => old.map(e => e.id === id ? { ...e, unread: false } : e));
    if (backendConfigured) void markEventSeen(id).catch(error => setToast(String(error)));
  }

  function addProperty() {
    const host = normalizeUtahSandsHost(newHost);
    if (!newName.trim() || !newAddress.trim() || !host) {
      setInputError('Add a name, address, and a valid utahsands.com hostname.');
      return;
    }
    if (properties.some(p => p.host === host)) {
      setInputError('That hostname is already used in this preview.');
      return;
    }
    if (backendConfigured && session?.user.id) {
      void addOwnedProperty(session.user.id, {
        name: newName.trim(), address: newAddress.trim(), location: '',
        host, state: 'planned'
      }).then(refreshOwner).catch(error => setToast(String(error)));
    } else {
      const id = 'planned-' + Date.now().toString();
      setProperties(old => [...old, {
        id, name: newName.trim(), address: newAddress.trim(), location: '',
        host, state: 'planned'
      }]);
      setPropertyScope(id);
    }
    setNewName(''); setNewAddress(''); setNewHost('');
    setShowAdd(false); setInputError('');
    setToast(backendConfigured ? 'Property saved to owner account; DNS is not created automatically.' : 'Property added to this preview only; not saved online.');
  }

  function chooseProperty(id: string) {
    setPropertyScope(id);
    setFilter('all');
    setTab('Home');
  }

  if (!authReady) return <View style={styles.centered}><ActivityIndicator size="large" color={GREEN} /></View>;
  if (backendConfigured && !session) return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.loginScreen}>
      <Text style={styles.wordmark}>UTAH SANDS</Text>
      <Text style={styles.brandSub}>PRIVATE OWNER ACCESS</Text>
      <Text style={[styles.pageTitle, { marginTop: 48 }]}>Sign in</Text>
      <Text style={[styles.subheading, { marginBottom: 18 }]}>For verified property owners only. Tenant accounts are not available in this app.</Text>
      <TextInput style={styles.input} placeholder="Email" keyboardType="email-address"
        autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password}
        autoComplete="password" onChangeText={setPassword} />
      {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
      <Pressable disabled={authBusy || !email.trim() || !password} onPress={() => void signIn()}
        style={[styles.primaryButton, authBusy && { opacity: 0.5 }]}>
        <Text style={styles.primaryButtonText}>{authBusy ? 'Signing in…' : 'Sign in securely'}</Text>
      </Pressable>
      <Text style={styles.note}>Your owner account must first be created in Supabase. No public sign-up is offered.</Text>
    </View>
  </SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={PAPER} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.wordmark}>UTAH SANDS</Text>
          <Text style={styles.brandSub}>OWNER MANAGER</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.previewBadge}><Text style={styles.previewText}>{backendConfigured ? 'OWNER' : 'PREVIEW'}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={'Activity: ' + unread + ' unread'}
            onPress={() => { setTab('Activity'); setFilter('all'); }} style={styles.notificationButton}>
            <Text style={{ fontSize: 21, color: INK }}>✉</Text>
            {unread > 0 ? <View style={styles.notificationDot} /> : null}
          </Pressable>
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
        refreshControl={backendConfigured ? <RefreshControl refreshing={refreshing} onRefresh={() => void refreshOwner()} /> : undefined}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerTitle}>{backendConfigured ? 'Owner account connected' : 'Preview mode · Sample data only'}</Text>
          <Text style={styles.previewBannerText}>{backendConfigured
            ? 'Only events from trusted integrations appear here. Email, payments, and push still require configuration.'
            : 'No payments, messages, or maintenance alerts are connected yet.'}</Text>
        </View>
        {toast ? <Pressable onPress={() => setToast('')} style={styles.infoBanner}>
          <Text style={styles.infoText}>{toast}   ×</Text>
        </Pressable> : null}

        {tab === 'Home' ? <>
          <Heading eyebrow="Portfolio overview" title="Good afternoon."
            subtitle="A clear view of what needs your attention." />
          <Text style={styles.smallLabel}>VIEWING</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
            contentContainerStyle={styles.filterRow}>
            <Pill label="All properties" selected={propertyScope === 'all'} onPress={() => setPropertyScope('all')} />
            {properties.map(p => <Pill key={p.id} label={p.name}
              selected={propertyScope === p.id} onPress={() => setPropertyScope(p.id)} />)}
          </ScrollView>
          <View style={styles.metricGrid}>
            <Metric title="Payments received" value={formatUSD(collected)} help={backendConfigured ? 'Recorded event total' : 'Illustrative total'} />
            <Metric title="Needs attention" value={String(needsAttention)} help={backendConfigured ? 'Unread action items' : 'Sample items unread'} />
            <Metric title="Properties" value={String(propertyScope === 'all' ? properties.length : 1)}
              help="Preview portfolio" />
            <Metric title="Unread activity" value={String(unread)} help={backendConfigured ? 'Owner updates' : 'Sample notifications'} />
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Pressable onPress={() => setTab('Activity')}><Text style={styles.actionLink}>View all →</Text></Pressable>
          </View>
          <View style={styles.card}>
            {summaryEvents.length ? summaryEvents.slice(0, 4).map((e, i) =>
              <React.Fragment key={e.id}>
                {i ? <View style={styles.line} /> : null}
                <ActivityRow event={e} name={properties.find(p => p.id === e.propertyId)?.name ?? 'Property'} onRead={() => markRead(e.id)} />
              </React.Fragment>
            ) : <Text style={styles.emptyText}>No activity for this property yet.</Text>}
          </View>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your properties</Text></View>
          {properties.filter(p => propertyScope === 'all' || propertyScope === p.id).map(p =>
            <Pressable key={p.id} onPress={() => chooseProperty(p.id)}
              accessibilityRole="button" style={styles.propertyCard}>
              <View style={styles.propertyMonogram}><Text style={styles.monogramText}>US</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propertyName}>{p.name}</Text>
                <Text style={styles.propertyAddress}>{p.address}</Text>
                <Text style={styles.propertyHost}>{p.host} · {p.state}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </> : null}

        {tab === 'Activity' ? <>
          <Heading eyebrow="Notifications & updates" title="Activity"
            subtitle="Track payments, messages, and resident requests in one place." />
          <Text style={styles.smallLabel}>PROPERTY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
            contentContainerStyle={styles.filterRow}>
            <Pill label="All" selected={propertyScope === 'all'} onPress={() => setPropertyScope('all')} />
            {properties.map(p => <Pill key={p.id} label={p.name}
              selected={propertyScope === p.id} onPress={() => setPropertyScope(p.id)} />)}
          </ScrollView>
          <Text style={styles.smallLabel}>TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
            contentContainerStyle={styles.filterRow}>
            {kinds.map(k => <Pill key={k.value} label={k.label}
              selected={filter === k.value} onPress={() => setFilter(k.value)} />)}
          </ScrollView>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{currentEvents.length} {backendConfigured ? 'updates' : 'sample updates'}</Text>
            <Pressable onPress={() => {
              const targets = events.filter(e => e.unread && (propertyScope === 'all' || e.propertyId === propertyScope));
              setEvents(old => old.map(e =>
                propertyScope === 'all' || e.propertyId === propertyScope ? { ...e, unread: false } : e));
              if (backendConfigured) void Promise.all(targets.map(e => markEventSeen(e.id)))
                .catch(error => setToast(String(error)));
            }}>
              <Text style={styles.actionLink}>Mark all read</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            {currentEvents.length ? currentEvents.map((e, i) =>
              <React.Fragment key={e.id}>
                {i ? <View style={styles.line} /> : null}
                <ActivityRow event={e} name={properties.find(p => p.id === e.propertyId)?.name ?? 'Property'} onRead={() => markRead(e.id)} />
              </React.Fragment>
            ) : <Text style={styles.emptyText}>Nothing matches this filter.</Text>}
          </View>
        </> : null}

        {tab === 'Properties' ? <>
          <Heading eyebrow="Property portfolio" title="Properties"
            subtitle="The same manager can eventually connect multiple Utah Sands subdomains." />
          {properties.map(p =>
            <Pressable key={p.id} onPress={() => chooseProperty(p.id)}
              accessibilityRole="button" style={styles.propertyCard}>
              <View style={styles.propertyMonogram}><Text style={styles.monogramText}>US</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propertyName}>{p.name}</Text>
                <Text style={styles.propertyAddress}>{p.address}</Text>
                {p.location ? <Text style={styles.propertyAddress}>{p.location}</Text> : null}
                <Text style={styles.propertyHost}>{p.host} · {p.state}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => setShowAdd(v => !v)}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{showAdd ? 'Cancel' : '+ Plan another property'}</Text>
          </Pressable>
          {showAdd ? <View style={styles.formCard}>
            <Text style={styles.formHeading}>New property (preview)</Text>
            <TextInput style={styles.input} placeholder="Property name" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="Street address" value={newAddress} onChangeText={setNewAddress} />
            <TextInput style={styles.input} placeholder="example.utahsands.com" autoCapitalize="none"
              keyboardType="url" value={newHost} onChangeText={setNewHost} />
            {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
            <Pressable onPress={addProperty} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Add to preview</Text></Pressable>
            <Text style={styles.note}>This does not create DNS or a website. {backendConfigured ? 'Property details are saved to your account.' : 'Preview additions disappear when the app reloads.'}</Text>
          </View> : null}
        </> : null}

        {tab === 'Settings' ? <>
          <Heading eyebrow="Owner preferences" title="Settings"
            subtitle="Choose which events should notify you after live integrations are enabled." />
          <View style={styles.card}>
            {([
              ['payment', 'Rent payments', 'Received, failed, and overdue'],
              ['message', 'New messages', 'Tenant email and rental inquiries'],
              ['maintenance', 'Maintenance', 'New resident requests'],
              ['inspection', 'Inspections', 'Submitted room checklists']
            ] as const).map(([key, title, description], i) =>
              <React.Fragment key={key}>
                {i ? <View style={styles.line} /> : null}
                <Pressable accessibilityRole="switch" accessibilityState={{ checked: notices[key] }}
                  onPress={() => {
                    const next = { ...notices, [key]: !notices[key] };
                    setNotices(next);
                    if (session?.user.id) void savePreferences(session.user.id, next)
                      .catch(error => setToast(String(error)));
                  }} style={styles.preferenceRow}>
                  <View style={{ flex: 1 }}><Text style={styles.activityTitle}>{title}</Text>
                    <Text style={styles.activityDetail}>{description}</Text></View>
                  <View style={[styles.toggle, notices[key] && styles.toggleOn]}><View style={[styles.toggleKnob, notices[key] && styles.toggleKnobOn]} /></View>
                </Pressable>
              </React.Fragment>
            )}
          </View>
          <Text style={styles.note}>{backendConfigured ? 'Preferences save to your owner account. Push delivery is not enabled yet.' : 'Preferences are temporary in this preview. No push notifications are sent.'}</Text>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Connection status</Text></View>
          <View style={styles.card}>
            {[
              ['Property website', 'utahsands.com · integration not yet deployed'],
              ['Rent processor', 'Not connected'],
              ['Email inbox', 'Not connected'],
              ['Resident requests', 'Demo pages only'],
              ['Owner account', backendConfigured ? 'Signed in' : 'Not configured'],
              ['Mobile push', pushStatus]
            ].map(([title, sub], i) =>
              <View key={title} style={[styles.connectionRow, i > 0 && { borderTopWidth: 1, borderTopColor: LINE }]}>
                <Text style={styles.connectionTitle}>{title}</Text>
                <Text style={styles.connectionSub}>{sub}</Text>
              </View>
            )}
          </View>
          <Text style={styles.note}>Never enter bank/card details in this app. Actual payments must go through a verified provider.</Text>
          {backendConfigured && session?.user.id ? <Pressable disabled={pushBusy}
            onPress={() => {
              setPushBusy(true);
              void registerOwnerDevice(session.user.id).then(() => {
                setPushStatus('Device registered · delivery server pending');
                setToast('This device is registered. Live push delivery still requires server setup.');
              }).catch(error => setToast(error instanceof Error ? error.message : String(error)))
                .finally(() => setPushBusy(false));
            }} style={[styles.primaryButton, pushBusy && { opacity: 0.5 }]}>
            <Text style={styles.primaryButtonText}>{pushBusy ? 'Registering…' : 'Register phone for alerts'}</Text>
          </Pressable> : null}
          {backendConfigured ? <Pressable onPress={() => void supabase?.auth.signOut()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Sign out</Text>
          </Pressable> : null}
        </> : null}
        <Text style={styles.footer}>{backendConfigured ? 'UTAH SANDS · OWNER ACCESS · NO IN-APP PAYMENTS' : 'UTAH SANDS · OWNER PREVIEW · NO LIVE TRANSACTIONS'}</Text>
      </ScrollView>
      <View style={styles.tabBar}>
        {(['Home', 'Activity', 'Properties', 'Settings'] as Tab[]).map(item =>
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }}
            onPress={() => { setTab(item); setToast(''); }} style={styles.tab}>
            <Text style={[styles.tabSymbol, tab === item && styles.activeTab]}>
              {({ Home: '⌂', Activity: '≡', Properties: '▦', Settings: '⚙' } as Record<Tab, string>)[item]}
            </Text>
            <Text style={[styles.tabLabel, tab === item && styles.activeTab]}>{item}</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAPER },
  loginScreen: { flex: 1, padding: 24, backgroundColor: LIGHT, justifyContent: 'center' },
  topBar: { height: 76, paddingHorizontal: 22, borderBottomColor: LINE, borderBottomWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { color: INK, fontSize: 17, fontWeight: '800', letterSpacing: 2.6 },
  brandSub: { color: MUTED, fontSize: 9, letterSpacing: 2.2, marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewBadge: { backgroundColor: '#F4EFE6', borderRadius: 5, paddingHorizontal: 10, paddingVertical: 7 },
  previewText: { fontWeight: '700', color: AMBER, fontSize: 10, letterSpacing: 0.9 },
  notificationButton: { padding: 6, position: 'relative' },
  notificationDot: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: 4, backgroundColor: '#B96B45' },
  scrollContent: { padding: 20, paddingBottom: 44, backgroundColor: LIGHT, flexGrow: 1 },
  previewBanner: { borderColor: '#E9DABD', borderWidth: 1, backgroundColor: '#FBF8F0',
    padding: 13, borderRadius: 10, marginBottom: 24 },
  previewBannerTitle: { color: '#765628', fontWeight: '700', fontSize: 12 },
  previewBannerText: { color: '#87755D', fontSize: 12, lineHeight: 19, marginTop: 3 },
  infoBanner: { padding: 12, borderRadius: 8, backgroundColor: '#E7F1E8', marginBottom: 16 },
  infoText: { color: GREEN, fontSize: 12, lineHeight: 18 },
  heading: { paddingBottom: 22 },
  eyebrow: { color: GREEN, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  pageTitle: { color: INK, fontSize: 32, letterSpacing: -1, fontWeight: '700', marginTop: 9 },
  subheading: { color: MUTED, fontSize: 14, lineHeight: 21, marginTop: 9 },
  smallLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1.4, marginBottom: 9 },
  filterRow: { paddingBottom: 23, paddingRight: 16, gap: 7 },
  pill: { borderRadius: 7, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: PAPER,
    borderColor: LINE, borderWidth: 1 },
  pillSelected: { backgroundColor: GREEN, borderColor: GREEN },
  pillText: { color: MUTED, fontWeight: '600', fontSize: 12 },
  pillTextSelected: { color: PAPER },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { backgroundColor: PAPER, borderRadius: 12, borderWidth: 1, borderColor: LINE,
    width: '48.5%', minHeight: 116, padding: 14, flexGrow: 1 },
  metricTitle: { fontSize: 11, color: MUTED, fontWeight: '600' },
  metricValue: { fontSize: 24, color: INK, fontWeight: '700', marginTop: 10, letterSpacing: -0.5 },
  metricHelp: { color: MUTED, fontSize: 10, marginTop: 7 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: INK },
  actionLink: { color: GREEN, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: PAPER, borderWidth: 1, borderColor: LINE, borderRadius: 12,
    paddingHorizontal: 15, paddingVertical: 3 },
  line: { height: 1, backgroundColor: LINE },
  activityRow: { flexDirection: 'row', paddingVertical: 16, gap: 12, alignItems: 'flex-start' },
  glyph: { width: 39, height: 39, borderRadius: 10, backgroundColor: '#EAF0EA',
    justifyContent: 'center', alignItems: 'center' },
  glyphText: { color: GREEN, fontSize: 18, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activityTitle: { flex: 1, fontWeight: '700', color: INK, fontSize: 13 },
  unreadDot: { width: 7, height: 7, backgroundColor: '#B5764B', borderRadius: 4 },
  activityDetail: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 5 },
  activityMeta: { color: '#909991', fontSize: 11, marginTop: 8 },
  emptyText: { color: MUTED, paddingVertical: 26, textAlign: 'center', fontSize: 13 },
  propertyCard: { backgroundColor: PAPER, flexDirection: 'row', alignItems: 'center',
    borderColor: LINE, borderWidth: 1, padding: 15, borderRadius: 12, marginBottom: 10, gap: 13 },
  propertyMonogram: { height: 55, width: 55, backgroundColor: '#E7ECE8', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center' },
  monogramText: { color: GREEN, fontWeight: '800', letterSpacing: 1 },
  propertyName: { color: INK, fontWeight: '700', fontSize: 14 },
  propertyAddress: { color: MUTED, marginTop: 4, fontSize: 12 },
  propertyHost: { color: GREEN, marginTop: 8, fontSize: 11 },
  chevron: { color: '#8F9990', fontSize: 27, marginHorizontal: 3 },
  primaryButton: { padding: 16, backgroundColor: GREEN, alignItems: 'center', borderRadius: 9, marginTop: 12 },
  primaryButtonText: { color: PAPER, fontSize: 13, fontWeight: '700' },
  formCard: { backgroundColor: PAPER, borderRadius: 12, borderColor: LINE, borderWidth: 1,
    padding: 16, marginTop: 12 },
  formHeading: { color: INK, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: LINE, borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 11, marginTop: 8, color: INK, backgroundColor: PAPER, fontSize: 14 },
  errorText: { color: '#A04D47', fontSize: 12, marginTop: 10 },
  note: { color: MUTED, fontSize: 11, marginTop: 14, lineHeight: 18 },
  preferenceRow: { flexDirection: 'row', paddingVertical: 18, alignItems: 'center', gap: 15 },
  toggle: { backgroundColor: '#CFD4CE', width: 43, height: 26, borderRadius: 13, justifyContent: 'center', padding: 3 },
  toggleOn: { backgroundColor: GREEN },
  toggleKnob: { backgroundColor: PAPER, width: 20, height: 20, borderRadius: 10 },
  toggleKnobOn: { alignSelf: 'flex-end' },
  connectionRow: { paddingVertical: 13 },
  connectionTitle: { color: INK, fontSize: 13, fontWeight: '700' },
  connectionSub: { fontSize: 12, color: MUTED, marginTop: 5 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE,
    backgroundColor: PAPER, paddingTop: 9, paddingBottom: 9 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  tabSymbol: { fontSize: 21, color: '#909B91' },
  tabLabel: { color: '#909B91', fontSize: 10, marginTop: 3, fontWeight: '600' },
  activeTab: { color: GREEN, fontWeight: '800' },
  footer: { color: '#9A9F98', textAlign: 'center', fontSize: 9, letterSpacing: 1,
    marginTop: 34, marginBottom: 5 },
});
