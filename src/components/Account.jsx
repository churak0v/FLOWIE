import React, { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { BottomSheet } from './ui/BottomSheet';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { OrderHistoryList } from './domain/OrderHistoryList';

function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const digits = s.replace(/[^\d+]/g, '');
  if (!digits) return '';
  const dOnly = digits.replace(/[^\d]/g, '');
  if (dOnly.length === 11 && (dOnly.startsWith('8') || dOnly.startsWith('7'))) {
    return `+7${dOnly.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function validatePhone(phone) {
  const v = normalizePhone(phone);
  if (!v) return false;
  return /^\+\d{10,15}$/.test(v);
}

function RowButton({ title, subtitle, onClick, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <Surface
        variant="soft"
        fullWidth
        style={{
          width: '100%',
          padding: 16,
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text
            variant="subtitle"
            style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.25 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <div style={{ marginTop: 6 }}>
              <Text
                variant="body"
                muted
                style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {subtitle}
              </Text>
            </div>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {right || null}
          <ChevronRight size={20} color="var(--muted)" />
        </div>
      </Surface>
    </button>
  );
}

function openSupport() {
  window.open('https://t.me/flowie_support', '_blank', 'noopener,noreferrer');
}

export function Account() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const tg = state.auth.telegramUser;
  const me = state.auth.me;
  const displayName = useMemo(() => {
    if (tg) return [tg.firstName, tg.lastName].filter(Boolean).join(' ') || 'Profile';
    return me?.name || 'Profile';
  }, [me?.name, tg]);

  const tag = tg?.username ? `@${tg.username}` : me?.username ? `@${me.username}` : 'No username';
  const photoUrl = tg?.photoUrl || '';
  const phoneBound = Boolean(me?.phone);

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('+');
  const phoneOk = validatePhone(phone);

  return (
    <>
      <AppShell style={{ '--app-content-inset-bottom': '0px', padding: 0 }}>
        <div
          style={{
            width: '100%',
            paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
            paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
            paddingTop: 'calc(var(--sp-2) + var(--app-inset-top))',
            paddingBottom: 'var(--sp-4)',
            boxSizing: 'border-box',
          }}
        >
          <Text variant="title">Account</Text>

          <div
            style={{
              marginTop: 'var(--sp-6)',
              display: 'grid',
              gap: 12,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
          <Surface
            variant="soft"
            fullWidth
            style={{
              width: '100%',
              padding: 16,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              maxWidth: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '999px',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  flexShrink: 0,
                }}
              >
                {photoUrl ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tag}
                  </Text>
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <Text variant="caption">Status</Text>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 1000, color: 'var(--accent)' }}>
                Buyer
              </div>
            </div>
          </Surface>

          {state.auth.meLoading ? (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="subtitle">Loading profile...</Text>
            </Surface>
          ) : !phoneBound ? (
            <RowButton
              title="Add a contact phone"
              subtitle="Used only if fulfillment needs clarification."
              onClick={() => {
                setPhone(me?.phone || '+');
                setPhoneOpen(true);
              }}
            />
          ) : (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="subtitle">Phone</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  {me.phone}
                </Text>
              </div>
            </Surface>
          )}

          <RowButton
            title="Contact support"
            subtitle="Questions about payment, delivery, or a wishlist order."
            onClick={openSupport}
          />
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="title">Order history</Text>
            <div style={{ marginTop: 12 }}>
              <OrderHistoryList limit={8} />
            </div>
          </Surface>
          <RowButton title="Data processing consent" onClick={() => navigate('/legal/consent')} />
          <RowButton title="Privacy policy" onClick={() => navigate('/legal/privacy')} />
          <RowButton title="Public offer" onClick={() => navigate('/legal/offer')} />
        </div>
        </div>
      </AppShell>

      <BottomSheet open={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <Text variant="title">Phone number</Text>
        <div style={{ marginTop: 10 }}>
          <Text variant="body" muted>
            Enter a phone number in international format.
          </Text>
        </div>

        <div style={{ marginTop: 14 }}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+1 555 000 0000"
            style={{
              width: '100%',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 12,
              background: 'var(--c-white)',
            }}
          />
          {!phone ? null : phoneOk ? null : (
            <div style={{ marginTop: 6 }}>
              <Text variant="caption">Check the phone number format.</Text>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, minWidth: 0, maxWidth: '100%' }}>
          <button
            type="button"
            disabled={!phoneOk}
            onClick={async () => {
              if (!phoneOk) return;
              try {
                await actions.updateMyPhone(normalizePhone(phone));
                setPhoneOpen(false);
              } catch (e) {
                alert(e?.data?.error || e?.message || 'Could not save the phone number');
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              border: 0,
              borderRadius: 'var(--r-lg)',
              background: phoneOk ? 'var(--accent)' : 'var(--c-ink-14)',
              color: 'var(--c-white)',
              fontWeight: 1000,
              cursor: phoneOk ? 'pointer' : 'default',
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setPhoneOpen(false)}
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'transparent',
              fontWeight: 1000,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
