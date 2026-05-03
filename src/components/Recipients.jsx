import React from 'react';
import { ChevronLeft, Link2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { RecipientSquareTile } from './domain/RecipientSquareTile';

export function Recipients() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const empty = state.recipients.items.length === 0;

  return (
    <>
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">Profiles</Text>
        </div>

        <Surface
          variant="soft"
          style={{
            marginTop: 'var(--sp-4)',
            padding: 16,
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(198,83,109,0.10), rgba(255,255,255,0.9))',
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                background: 'var(--c-white)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 8px 20px rgba(198,83,109,0.14)',
              }}
            >
              <Link2 size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <Text variant="subtitle">Shared wishlist profiles</Text>
              <Text variant="body" muted style={{ marginTop: 6, lineHeight: 1.35 }}>
                Profiles appear here when someone shares a FLOWIE wishlist with you. The app is only for choosing real wishlist gifts and checking out safely.
              </Text>
              <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 900, fontSize: 13 }}>
                <ShieldCheck size={15} />
                No open catalog of people, only shared wishlists.
              </div>
            </div>
          </div>
        </Surface>

        {empty ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
              <Text variant="subtitle">No profiles yet</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  Open a shared wishlist link to see a profile here.
                </Text>
              </div>
              <button
                type="button"
                onClick={() => navigate('/?ref=vivienne')}
                style={{
                  marginTop: 12,
                  height: 44,
                  borderRadius: 'var(--r-lg)',
                  border: 0,
                  background: 'var(--accent)',
                  color: 'var(--c-white)',
                  fontWeight: 1000,
                  cursor: 'pointer',
                  padding: '0 14px',
                }}
              >
                Open Vivienne
              </button>
            </Surface>
          </div>
        ) : (
          <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {state.recipients.items.map((r) => (
              <RecipientSquareTile
                key={r.id}
                recipient={r}
                onClick={() => {
                  actions.selectRecipient(r.id);
                  navigate(`/recipients/${r.id}`);
                }}
              />
            ))}
          </div>
        )}
      </AppShell>
    </>
  );
}
