import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  Copy,
  DollarSign,
  ExternalLink,
  Lock,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAppState } from '../../state/AppState';
import { formatMoney } from '../../lib/money';
import { AppImage } from '../ui/AppImage';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

const STORAGE_KEY = 'flowie_creator_console_v3';
const PLATFORM_FEE = 0.2;

const NAV = [
  { id: 'overview', label: 'Overview', icon: DollarSign },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'wishlist', label: 'Wishlist', icon: Package },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'subscription', label: 'Subscription', icon: Sparkles },
];

const PLANS = [
  { id: 'starter', name: 'Starter', price: 29, features: ['1 creator profile', '25 wishlist items', 'Basic order board'] },
  { id: 'pro', name: 'Pro', price: 79, features: ['10 creator profiles', 'Unlimited wishlist', 'Custom item review', 'Video blocks'] },
  { id: 'studio', name: 'Studio', price: 199, features: ['Team access', 'Bulk import', 'Advanced analytics', 'Priority moderation'] },
];

const BLOCKED = [
  { pattern: /\b(gun|pistol|rifle|knife|ammo|weapon|taser)\b/i, reason: 'Weapons and dangerous items are not allowed.' },
  { pattern: /\b(cocaine|heroin|meth|mdma|lsd|opioid|narcotic|drug)\b/i, reason: 'Drugs and controlled substances are not allowed.' },
  { pattern: /\b(passport|fake id|ssn|credit card|stolen|counterfeit)\b/i, reason: 'Fraud and identity/financial instruments are blocked.' },
  { pattern: /\b(hacking|malware|exploit|botnet|ddos|doxing)\b/i, reason: 'Abuse, hacking, and privacy-invasive services are blocked.' },
];

const DEFAULT_PROFILE = {
  id: 'vivienne',
  name: 'Vivienne',
  handle: '@_v.morel',
  status: 'verified',
  image: '/vivienne-avatar.jpeg',
  bio: 'Verified wishlist profile. Buyers choose approved gifts. Delivery details stay controlled by the recipient.',
  productIds: [1, 2, 3, 4],
  customProducts: [],
  withdrawals: [],
};

const inputStyle = {
  width: '100%',
  height: 42,
  borderRadius: 12,
  border: '1px solid var(--border)',
  padding: '0 12px',
  background: 'var(--surface)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

function readWorkspace() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.profiles?.length) {
      const profiles = saved.profiles.map((profile) => {
        const isOldAdeline = profile?.id === 'adeline' || String(profile?.name || '').toLowerCase() === 'adeline';
        const isVivienne = profile?.id === 'vivienne' || String(profile?.name || '').toLowerCase() === 'vivienne';
        if (!isOldAdeline && !isVivienne) return profile;
        return {
          ...profile,
          id: profile.id === 'adeline' ? 'vivienne' : profile.id,
          name: 'Vivienne',
          handle: !profile.handle || ['@adeline.safe', '@vivienne.safe'].includes(profile.handle) ? '@_v.morel' : profile.handle,
          image: '/vivienne-avatar.jpeg',
        };
      });
      return {
        ...saved,
        selectedId: saved.selectedId === 'adeline' ? 'vivienne' : saved.selectedId,
        profiles,
      };
    }
  } catch {
    // ignore
  }
  return {
    selectedId: DEFAULT_PROFILE.id,
    subscription: { plan: 'pro', status: 'trial', renewsAt: '2026-06-02' },
    profiles: [DEFAULT_PROFILE],
  };
}

function saveWorkspace(workspace) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    // ignore
  }
}

function slugify(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function moderationCheck(item) {
  const text = `${item.name || ''} ${item.description || ''} ${item.tags || ''}`;
  for (const rule of BLOCKED) {
    if (rule.pattern.test(text)) return { ok: false, reason: rule.reason };
  }
  return { ok: true, reason: 'Allowed. Adult and intimate gifts are OK when legal, consensual, and non-harmful.' };
}

function statusLabel(order) {
  const st = String(order?.status || '').toUpperCase();
  const ps = String(order?.paymentStatus || '').toUpperCase();
  if (st === 'DELIVERED') return 'Delivered';
  if (st === 'IN_DELIVERY') return 'On the way';
  if (st === 'ASSEMBLED') return 'Packed';
  if (st === 'ACCEPTED' || st === 'PAID') return 'Accepted';
  if (ps === 'CONFIRMED') return 'Paid';
  return 'Payment';
}

function buyerLabel(order) {
  const user = order?.user || {};
  if (user.username) return `@${user.username}`;
  if (user.name) return user.name;
  return order?.senderPhone || user.phone || 'Buyer';
}

function Button({ children, icon, onClick, disabled = false, variant = 'primary' }) {
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 40,
        borderRadius: 12,
        border: primary ? 0 : '1px solid var(--border)',
        padding: '0 12px',
        background: disabled ? 'var(--c-ink-14)' : primary ? 'var(--accent)' : 'var(--surface)',
        color: primary ? 'var(--c-white)' : 'var(--text)',
        fontWeight: 1000,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        cursor: disabled ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <Text variant="caption" muted>{label}</Text>
      {children}
    </label>
  );
}

function Metric({ label, value, sub, icon, accent = false }) {
  return (
    <Surface variant="default" style={{ padding: 16, borderRadius: 18, border: '1px solid var(--border)', background: accent ? 'linear-gradient(135deg, var(--c-accent-10), var(--surface) 72%)' : 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <Text variant="caption" muted>{label}</Text>
          <div style={{ marginTop: 5, fontSize: 26, fontWeight: 1000, lineHeight: 1 }}>{value}</div>
          {sub ? <Text variant="caption" muted style={{ marginTop: 8 }}>{sub}</Text> : null}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: accent ? 'var(--accent)' : 'var(--surface-2)', color: accent ? 'white' : 'var(--accent)' }}>
          {icon}
        </div>
      </div>
    </Surface>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div>
        <Text variant="title">{title}</Text>
        {subtitle ? <Text variant="body" muted style={{ marginTop: 4 }}>{subtitle}</Text> : null}
      </div>
      {action}
    </div>
  );
}

export function WebmasterDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, actions } = useAppState();
  const [workspace, setWorkspace] = useState(readWorkspace);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState('');
  const [profileDraft, setProfileDraft] = useState({ name: '', handle: '', image: '', bio: '' });
  const [customDraft, setCustomDraft] = useState({ name: '', price: '', image: '', description: '', tags: 'adult,wishlist' });
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const section = (() => {
    const tail = location.pathname.replace(/^\/webmaster\/?/, '').split('/')[0];
    return NAV.some((n) => n.id === tail) ? tail : 'overview';
  })();

  useEffect(() => {
    actions.loadProducts();
  }, [actions]);

  useEffect(() => {
    saveWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    let alive = true;
    api.getOrders().then((res) => {
      if (alive) setOrders(Array.isArray(res) ? res : []);
    }).catch(() => {
      if (alive) setOrders([]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const profiles = workspace.profiles || [];
  const selected = profiles.find((p) => p.id === workspace.selectedId) || profiles[0] || DEFAULT_PROFILE;
  const currentPlan = PLANS.find((p) => p.id === workspace.subscription?.plan) || PLANS[1];
  const products = state.products.items || [];
  const selectedIds = new Set(selected.productIds || []);
  const profileOrders = orders.filter((o) => String(o?.recipientName || '').trim().toLowerCase() === String(selected.name || '').trim().toLowerCase());
  const paidOrders = profileOrders.filter((o) => String(o?.paymentStatus || '').toUpperCase() === 'CONFIRMED');
  const gross = paidOrders.reduce((sum, o) => sum + Number(o?.totalPrice || 0), 0);
  const fee = Math.round(gross * PLATFORM_FEE);
  const net = Math.max(0, gross - fee);
  const requested = (selected.withdrawals || []).reduce((sum, w) => sum + Number(w.amount || 0), 0);
  const available = Math.max(0, net - requested);
  const publicLink = `${window.location.origin}/?ref=${encodeURIComponent(slugify(selected.name) || selected.id)}`;
  const moderation = moderationCheck(customDraft);
  const hasPro = ['pro', 'studio'].includes(currentPlan.id);
  const hasStudio = currentPlan.id === 'studio';

  const updateSelected = (patch) => {
    setWorkspace((prev) => ({
      ...prev,
      profiles: (prev.profiles || []).map((p) => (p.id === selected.id ? { ...p, ...patch } : p)),
    }));
  };

  const createProfile = () => {
    const name = profileDraft.name.trim();
    if (!name) return;
    const baseId = slugify(profileDraft.handle || name) || `creator-${Date.now()}`;
    const taken = new Set((workspace.profiles || []).map((p) => p.id));
    const id = taken.has(baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
    const next = {
      ...DEFAULT_PROFILE,
      id,
      name,
      handle: profileDraft.handle.trim() || `@${id}`,
      status: 'draft',
      image: profileDraft.image.trim() || DEFAULT_PROFILE.image,
      bio: profileDraft.bio.trim() || 'Verified wishlist profile. Buyers choose from approved gifts attached to this creator.',
      productIds: [],
      customProducts: [],
      withdrawals: [],
    };
    setWorkspace((prev) => ({ ...prev, profiles: [next, ...(prev.profiles || [])], selectedId: id }));
    setProfileDraft({ name: '', handle: '', image: '', bio: '' });
  };

  const addCustom = () => {
    if (!moderation.ok) return;
    const price = Math.round(Number(customDraft.price || 0));
    if (!customDraft.name.trim() || !price || !customDraft.image.trim()) return;
    updateSelected({
      customProducts: [
        { id: `custom-${Date.now()}`, name: customDraft.name.trim(), price, image: customDraft.image.trim(), description: customDraft.description.trim(), status: 'review' },
        ...(selected.customProducts || []),
      ],
    });
    setCustomDraft({ name: '', price: '', image: '', description: '', tags: 'adult,wishlist' });
  };

  const requestPayout = () => {
    const amount = Math.round(Number(withdrawAmount || 0));
    if (!amount || amount > available) return;
    updateSelected({ withdrawals: [{ id: `wd-${Date.now()}`, amount, status: 'requested', createdAt: new Date().toISOString() }, ...(selected.withdrawals || [])] });
    setWithdrawAmount('');
  };

  const renderOverview = () => (
    <>
      <SectionTitle title="Overview" subtitle="Operational snapshot for the selected creator profile." action={<Button variant="ghost" onClick={() => navigator.clipboard?.writeText(publicLink).catch(() => {})} icon={<Copy size={16} />}>Copy link</Button>} />
      <Surface variant="default" style={{ padding: 16, borderRadius: 22, border: '1px solid var(--border)', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
          <AppImage src={selected.image} alt={selected.name} style={{ width: 86, height: 86, borderRadius: 24, objectFit: 'cover' }} />
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 25, fontWeight: 1000 }}>{selected.name}</div>
              <span className="ui-chip ui-chip--accent"><ShieldCheck size={13} /> {selected.status}</span>
            </div>
            <Text variant="body" muted style={{ marginTop: 6 }}>{selected.bio}</Text>
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip">{selected.handle}</span>
              <span className="ui-chip">20% platform fee</span>
              <span className="ui-chip">{currentPlan.name} plan</span>
            </div>
          </div>
          <Button variant="ghost" onClick={() => window.open(publicLink, '_blank')} icon={<ExternalLink size={16} />}>Open profile</Button>
        </div>
      </Surface>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Metric label="Gross sales" value={formatMoney(gross)} sub={`${paidOrders.length} paid orders`} icon={<DollarSign size={20} />} accent />
        <Metric label="Platform fee" value={formatMoney(fee)} sub="20% from sales" icon={<ShieldCheck size={20} />} />
        <Metric label="Net payout" value={formatMoney(net)} sub={`${formatMoney(available)} available`} icon={<Wallet size={20} />} />
        <Metric label="Wishlist" value={(selected.productIds || []).length + (selected.customProducts || []).length} sub="Approved + review items" icon={<Package size={20} />} />
      </div>
    </>
  );

  const renderProfiles = () => (
    <>
      <SectionTitle
        title="Profiles"
        subtitle="Create creator profiles, edit public details, and choose which profile is currently active."
        action={<Button onClick={createProfile} disabled={!profileDraft.name.trim()} icon={<UserPlus size={16} />}>Create</Button>}
      />
      <div className="creator-console__profilesGrid">
        <Surface variant="default" style={{ padding: 10, borderRadius: 24, border: '1px solid var(--border)' }}>
          <div style={{ padding: '6px 6px 12px' }}>
            <Text variant="subtitle">All profiles</Text>
            <Text variant="caption" muted style={{ marginTop: 4 }}>{profiles.length} profiles in this workspace</Text>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {profiles.map((profile) => {
              const active = profile.id === selected.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setWorkspace((prev) => ({ ...prev, selectedId: profile.id }))}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '56px minmax(0, 1fr)',
                    gap: 12,
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 18,
                    border: active ? '1px solid var(--c-accent-border)' : '1px solid transparent',
                    background: active ? 'var(--c-accent-10)' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <AppImage src={profile.image} alt={profile.name} style={{ width: 56, height: 56, borderRadius: 18, objectFit: 'cover' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</div>
                      {profile.status === 'verified' ? <ShieldCheck size={15} color="var(--accent)" /> : null}
                    </div>
                    <Text variant="caption" muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.handle}</Text>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={active ? 'ui-chip ui-chip--accent' : 'ui-chip'}>{active ? 'Active' : profile.status}</span>
                      <span className="ui-chip">{(profile.productIds || []).length + (profile.customProducts || []).length} gifts</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Surface>

        <div style={{ display: 'grid', gap: 14 }}>
          <Surface variant="default" style={{ padding: 18, borderRadius: 24, border: '1px solid var(--border)' }}>
            <div className="creator-console__profileHero">
              <AppImage src={selected.image} alt={selected.name} style={{ width: 104, height: 104, borderRadius: 30, objectFit: 'cover' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text variant="title">{selected.name}</Text>
                  {selected.status === 'verified' ? <span className="ui-chip ui-chip--accent"><ShieldCheck size={13} /> Verified</span> : <span className="ui-chip">{selected.status}</span>}
                </div>
                <Text variant="body" muted style={{ marginTop: 5 }}>{selected.handle}</Text>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="ghost" onClick={() => window.open(publicLink, '_blank')} icon={<ExternalLink size={16} />}>Open public profile</Button>
                  <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(publicLink).catch(() => {})} icon={<Copy size={16} />}>Copy link</Button>
                </div>
              </div>
            </div>

            <div className="creator-console__editorGrid" style={{ marginTop: 18 }}>
              <Field label="Display name"><input style={inputStyle} value={selected.name || ''} onChange={(e) => updateSelected({ name: e.target.value })} /></Field>
              <Field label="Handle"><input style={inputStyle} value={selected.handle || ''} onChange={(e) => updateSelected({ handle: e.target.value })} /></Field>
              <Field label="Status">
                <select style={inputStyle} value={selected.status || 'draft'} onChange={(e) => updateSelected({ status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="verified">Verified</option>
                  <option value="paused">Paused</option>
                </select>
              </Field>
              <Field label="Avatar URL"><input style={inputStyle} value={selected.image || ''} onChange={(e) => updateSelected({ image: e.target.value })} /></Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Public bio">
                  <textarea style={{ ...inputStyle, minHeight: 94, height: 'auto', paddingTop: 11, resize: 'vertical', fontFamily: 'inherit' }} value={selected.bio || ''} onChange={(e) => updateSelected({ bio: e.target.value })} />
                </Field>
              </div>
            </div>
          </Surface>

          <Surface variant="default" style={{ padding: 18, borderRadius: 24, border: '1px solid var(--border)' }}>
            <SectionTitle title="Create profile" subtitle="Add a new creator workspace. You can attach wishlist products after creation." />
            <div className="creator-console__editorGrid">
              <Field label="Name"><input style={inputStyle} value={profileDraft.name} onChange={(e) => setProfileDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Vivienne" /></Field>
              <Field label="Handle"><input style={inputStyle} value={profileDraft.handle} onChange={(e) => setProfileDraft((v) => ({ ...v, handle: e.target.value }))} placeholder="@_v.morel" /></Field>
              <Field label="Avatar URL"><input style={inputStyle} value={profileDraft.image} onChange={(e) => setProfileDraft((v) => ({ ...v, image: e.target.value }))} placeholder="https://..." /></Field>
              <Field label="Public bio"><input style={inputStyle} value={profileDraft.bio} onChange={(e) => setProfileDraft((v) => ({ ...v, bio: e.target.value }))} placeholder="Short buyer-facing description" /></Field>
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={createProfile} disabled={!profileDraft.name.trim()} icon={<UserPlus size={16} />}>Create profile</Button>
            </div>
          </Surface>
        </div>
      </div>
    </>
  );

  const renderWishlist = () => {
    const filtered = products.filter((p) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${p.title || ''} ${p.subtitle || ''}`.toLowerCase().includes(q);
    });
    return (
      <>
        <SectionTitle title="Wishlist" subtitle="Pick catalog products or submit creator-specific items for review." action={<div style={{ position: 'relative', minWidth: 240 }}><Search size={15} color="var(--muted)" style={{ position: 'absolute', left: 11, top: 13 }} /><input style={{ ...inputStyle, paddingLeft: 34 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" /></div>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.65fr)', gap: 14 }}>
          <Surface variant="default" style={{ padding: 16, borderRadius: 22, border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {filtered.map((p) => {
                const active = selectedIds.has(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => { const ids = new Set(selected.productIds || []); ids.has(p.id) ? ids.delete(p.id) : ids.add(p.id); updateSelected({ productIds: Array.from(ids) }); }} style={{ border: active ? '1px solid var(--c-accent-border)' : '1px solid var(--border)', background: active ? 'var(--c-accent-10)' : 'var(--surface)', borderRadius: 18, padding: 8, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ position: 'relative' }}><AppImage src={p.image} alt={p.title} style={{ width: '100%', aspectRatio: '1/1', borderRadius: 14, objectFit: 'cover' }} />{active ? <span style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 999, background: 'var(--accent)', color: 'white', display: 'grid', placeItems: 'center' }}><Check size={16} strokeWidth={3} /></span> : null}</div>
                    <div style={{ marginTop: 8, fontWeight: 1000, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    <Text variant="caption" style={{ color: 'var(--accent)' }}>{formatMoney(p.price)}</Text>
                  </button>
                );
              })}
            </div>
          </Surface>
          <Surface variant="default" style={{ padding: 16, borderRadius: 22, border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Custom item review</Text>
            <Text variant="caption" muted style={{ marginTop: 5 }}>Adult gifts allowed. Weapons, drugs, fraud, hacking, and dangerous goods are blocked.</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 10, opacity: hasPro ? 1 : 0.52 }}>
              <Field label="Name"><input disabled={!hasPro} style={inputStyle} value={customDraft.name} onChange={(e) => setCustomDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Silk lingerie set" /></Field>
              <Field label="Price"><input disabled={!hasPro} style={inputStyle} inputMode="numeric" value={customDraft.price} onChange={(e) => setCustomDraft((v) => ({ ...v, price: e.target.value.replace(/\D/g, '') }))} placeholder="89" /></Field>
              <Field label="Image URL"><input disabled={!hasPro} style={inputStyle} value={customDraft.image} onChange={(e) => setCustomDraft((v) => ({ ...v, image: e.target.value }))} placeholder="https://..." /></Field>
              <Field label="Review note"><textarea disabled={!hasPro} style={{ ...inputStyle, height: 76, paddingTop: 10, resize: 'vertical' }} value={customDraft.description} onChange={(e) => setCustomDraft((v) => ({ ...v, description: e.target.value }))} placeholder="What is it and why is it safe?" /></Field>
              <Surface variant="soft" style={{ padding: 10, borderRadius: 14, border: `1px solid ${moderation.ok ? 'var(--c-success-border)' : 'rgba(217,45,32,0.26)'}`, color: moderation.ok ? 'var(--c-success)' : '#d92d20' }}><Text variant="caption" style={{ display: 'flex', gap: 7, alignItems: 'center' }}>{moderation.ok ? <ShieldCheck size={15} /> : <AlertTriangle size={15} />}{moderation.reason}</Text></Surface>
              <Button disabled={!hasPro || !moderation.ok || !customDraft.name || !customDraft.price || !customDraft.image} onClick={addCustom} icon={<Plus size={16} />}>Send to review</Button>
            </div>
          </Surface>
        </div>
      </>
    );
  };

  const renderOrders = () => (
    <>
      <SectionTitle title="Orders" subtitle="Every buyer order attached to the selected creator profile." />
      <Surface variant="default" style={{ padding: 16, borderRadius: 22, border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gap: 9 }}>
          {profileOrders.length ? profileOrders.map((order) => (
            <Surface key={order.id} variant="soft" style={{ padding: 12, borderRadius: 18, border: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12 }}>
                <div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><strong>Gift #{order.id}</strong><span className="ui-chip ui-chip--accent">{statusLabel(order)}</span></div><Text variant="body" muted style={{ marginTop: 6 }}>Buyer: {buyerLabel(order)} · {order.senderPhone || order.user?.phone || 'no phone'}</Text><Text variant="caption" muted style={{ marginTop: 4 }}>{(order.items || []).map((it) => it.product?.name).filter(Boolean).join(', ') || 'Wishlist item'}</Text></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 21, fontWeight: 1000, color: 'var(--accent)' }}>{formatMoney(order.totalPrice || 0)}</div><Text variant="caption" muted>{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></div>
              </div>
            </Surface>
          )) : <Surface variant="soft" style={{ padding: 16, borderRadius: 18, border: '1px solid var(--border)', textAlign: 'center' }}><Text variant="subtitle">No orders yet</Text><Text variant="body" muted style={{ marginTop: 5 }}>Share the profile link to start receiving gifts.</Text></Surface>}
        </div>
      </Surface>
    </>
  );

  const renderPayouts = () => (
    <>
      <SectionTitle title="Payouts" subtitle="Sales minus the 20% platform commission. Requests are reviewed by operations." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Metric label="Gross sales" value={formatMoney(gross)} icon={<DollarSign size={20} />} accent />
        <Metric label="Platform fee" value={formatMoney(fee)} sub="20%" icon={<ShieldCheck size={20} />} />
        <Metric label="Available" value={formatMoney(available)} icon={<Wallet size={20} />} />
      </div>
      <Surface variant="default" style={{ padding: 16, borderRadius: 22, border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10 }}>
          <input style={inputStyle} inputMode="numeric" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value.replace(/\D/g, ''))} placeholder="Amount" />
          <Button onClick={requestPayout} disabled={!Number(withdrawAmount) || Number(withdrawAmount) > available} icon={<Banknote size={16} />}>Request payout</Button>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {(selected.withdrawals || []).map((w) => <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}><span>{formatMoney(w.amount)}</span><span style={{ color: 'var(--muted)' }}>{w.status}</span></div>)}
        </div>
      </Surface>
    </>
  );

  const renderSubscription = () => (
    <>
      <SectionTitle title="Subscription" subtitle="Platform access is subscription-based. The marketplace commission remains 20% on every sale." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {PLANS.map((plan) => (
          <button key={plan.id} type="button" onClick={() => setWorkspace((prev) => ({ ...prev, subscription: { ...prev.subscription, plan: plan.id, status: 'active' } }))} style={{ border: plan.id === currentPlan.id ? '1px solid var(--c-accent-border)' : '1px solid var(--border)', borderRadius: 20, padding: 16, textAlign: 'left', background: plan.id === currentPlan.id ? 'var(--c-accent-10)' : 'var(--surface)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><div style={{ fontSize: 19, fontWeight: 1000 }}>{plan.name}</div><Text variant="body" muted>${plan.price}/month</Text></div>{plan.id === currentPlan.id ? <span className="ui-chip ui-chip--accent">Active</span> : <Lock size={18} color="var(--muted)" />}</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>{plan.features.map((f) => <Text key={f} variant="caption" style={{ display: 'flex', gap: 7, alignItems: 'center' }}><Check size={14} color="var(--accent)" strokeWidth={3} />{f}</Text>)}</div>
          </button>
        ))}
      </div>
      <Surface variant="default" style={{ marginTop: 14, padding: 16, borderRadius: 20, border: '1px solid var(--border)' }}>
        <Text variant="subtitle">Feature access</Text>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <Text variant="body" muted>{hasPro ? 'Enabled' : 'Locked'}: custom product review and video wishlist blocks</Text>
          <Text variant="body" muted>{hasStudio ? 'Enabled' : 'Locked'}: bulk import, team roles, advanced analytics</Text>
        </div>
      </Surface>
    </>
  );

  const screen = {
    overview: renderOverview,
    profiles: renderProfiles,
    wishlist: renderWishlist,
    orders: renderOrders,
    payouts: renderPayouts,
    subscription: renderSubscription,
  }[section] || renderOverview;

  return (
    <div className="creator-console" style={{ minHeight: 'var(--app-vh)', background: '#f3f3f0', overflowY: 'auto', padding: 'calc(18px + var(--app-inset-top)) calc(18px + var(--app-inset-right)) calc(24px + var(--app-inset-bottom)) calc(18px + var(--app-inset-left))' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto' }}>
        <Surface className="creator-console__appbar" variant="default" style={{ padding: 12, borderRadius: 26, border: '1px solid var(--border)', marginBottom: 16 }}>
          <div className="creator-console__topbar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <button type="button" onClick={() => navigate('/')} style={{ width: 44, height: 44, borderRadius: 15, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Back to buyer app">
                <ArrowLeft size={19} />
              </button>
              <div style={{ width: 44, height: 44, borderRadius: 15, background: 'linear-gradient(135deg, var(--accent), var(--c-accent-2))', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 1000, letterSpacing: 0.4, flex: '0 0 auto' }}>F</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 1000, lineHeight: 1 }}>FLOWIE Studio</div>
                <Text variant="body" muted style={{ marginTop: 3 }}>Profiles, wishlists, orders, payouts</Text>
              </div>
            </div>
            <div className="creator-console__headerActions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                value={selected.id}
                onChange={(e) => setWorkspace((prev) => ({ ...prev, selectedId: e.target.value }))}
                style={{ ...inputStyle, width: 190, height: 40, fontWeight: 900 }}
                aria-label="Select active creator profile"
              >
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <Button variant="ghost" onClick={() => window.open(publicLink, '_blank')} icon={<ExternalLink size={16} />}>Public profile</Button>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(publicLink).catch(() => {})} icon={<Copy size={16} />}>Copy link</Button>
            </div>
          </div>

          <div className="creator-console__desktopNav" style={{ marginTop: 12 }}>
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id === 'overview' ? '/webmaster' : `/webmaster/${item.id}`)}
                  className={`creator-console__desktopNavButton ${active ? 'creator-console__desktopNavButton--active' : ''}`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </Surface>

        <div className="creator-console__grid" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <Surface className="creator-console__sidebar" variant="default" style={{ padding: 12, borderRadius: 24, border: '1px solid var(--border)', position: 'sticky', top: 18 }}>
            <div style={{ padding: 8, display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <AppImage src={selected.image} alt={selected.name} style={{ width: 44, height: 44, borderRadius: 14, objectFit: 'cover' }} />
              <div><div style={{ fontWeight: 1000, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</div><Text variant="caption" muted>{currentPlan.name} · 20% fee</Text></div>
            </div>
            <div style={{ marginTop: 10, padding: 10, borderRadius: 18, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Text variant="caption" muted>Available payout</Text>
              <div style={{ marginTop: 3, fontSize: 24, fontWeight: 1000 }}>{formatMoney(available)}</div>
              <Text variant="caption" muted style={{ marginTop: 4 }}>After 20% platform fee</Text>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => navigate(item.id === 'overview' ? '/webmaster' : `/webmaster/${item.id}`)} style={{ height: 42, border: 0, borderRadius: 14, background: active ? 'var(--c-accent-10)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', fontWeight: 1000, cursor: 'pointer', textAlign: 'left' }}>
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </Surface>

          <main>{screen()}</main>
        </div>
      </div>
      <nav className="creator-console__bottomNav" aria-label="Creator console navigation">
        <div className="creator-console__bottomNavInner">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id === 'overview' ? '/webmaster' : `/webmaster/${item.id}`)}
                className={`creator-console__bottomNavButton ${active ? 'creator-console__bottomNavButton--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
