import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { useAppState } from '../../state/AppState';
import { RecipientSquareTile } from './RecipientSquareTile';

function Tile({ children, onClick, style }) {
  return (
    <Surface
      variant="soft"
      onClick={onClick}
      style={{
        aspectRatio: '1 / 1',
        minHeight: 140,
        borderRadius: 'var(--r-lg)',
        padding: 14,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        ...style,
      }}
    >
      {children}
    </Surface>
  );
}

function normalizeRecipientName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function recipientTime(r) {
  return Date.parse(r?.updatedAt || r?.createdAt || '') || 0;
}

function dedupeRecipients(items, selectedId) {
  const byName = new Map();

  for (const r of items || []) {
    if (!r) continue;
    const key = normalizeRecipientName(r.name) || `id:${r.id}`;
    const prev = byName.get(key);
    const rSelected = String(r.id) === String(selectedId);
    const prevSelected = String(prev?.id) === String(selectedId);
    const shouldReplace =
      !prev ||
      (rSelected && !prevSelected) ||
      (!prevSelected && recipientTime(r) > recipientTime(prev)) ||
      (!prevSelected && recipientTime(r) === recipientTime(prev) && Number(r.id || 0) > Number(prev.id || 0));

    if (shouldReplace) byName.set(key, r);
  }

  return Array.from(byName.values()).sort((a, b) => {
    const aSelected = String(a.id) === String(selectedId);
    const bSelected = String(b.id) === String(selectedId);
    if (aSelected !== bSelected) return aSelected ? -1 : 1;
    const bt = recipientTime(b);
    const at = recipientTime(a);
    if (bt !== at) return bt - at;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

export function SubscriptionRow() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const recipients = useMemo(
    () => dedupeRecipients(state.recipients.items || [], state.recipients.selectedId),
    [state.recipients.items, state.recipients.selectedId]
  );

  const tiles = useMemo(() => {
    const list = recipients.filter(Boolean);

    if (list.length === 0) {
      return [
        { type: 'pass', key: 'pass' },
      ];
    }

    if (list.length === 1) {
      return [
        { type: 'recipient', key: `r:${list[0].id}`, recipient: list[0] },
        { type: 'pass', key: 'pass' },
      ];
    }

    // 2+ recipients: PASS first, then all recipients.
    return [{ type: 'pass', key: 'pass' }, ...list.map((r) => ({ type: 'recipient', key: `r:${r.id}`, recipient: r }))];
  }, [recipients]);

  const renderTile = (t) => {
    if (!t) return <div />;

    if (t.type === 'recipient') {
      return (
        <RecipientSquareTile
          recipient={t.recipient}
          onClick={() => {
            if (t.href) {
              navigate(t.href);
              return;
            }
            actions.selectRecipient(t.recipient.id);
            navigate(`/recipients/${t.recipient.id}`);
          }}
        />
      );
    }

    return (
      <Tile
        onClick={() => alert('FLOWIE Pass is coming soon')}
        style={{
          position: 'relative',
          background: 'linear-gradient(145deg, var(--c-accent), var(--c-accent-2))',
          color: 'var(--c-white)',
        }}
      >
        <span
          className="ui-chip"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            height: 24,
            padding: '0 10px',
            borderColor: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.12)',
            color: 'var(--c-white)',
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          Soon
        </span>
        <Text variant="subtitle" style={{ color: 'var(--c-white)' }}>
          FLOWIE Pass
        </Text>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 0, opacity: 0.92 }}>PASS</div>
      </Tile>
    );
  };

  const useCarousel = tiles.length > 2;

  return (
    <div style={{ position: 'relative' }}>
      {useCarousel ? (
        <div
          className="hide-scrollbar"
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            paddingBottom: 2,
          }}
        >
          {tiles.map((t) => (
            <div
              key={t.key}
              style={{
                flex: '0 0 calc((100% - 24px) / 2.5)', // 2.5 cards per row
                scrollSnapAlign: 'start',
              }}
            >
              {renderTile(t)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {tiles.map((t) => (
            <div key={t.key}>{renderTile(t)}</div>
          ))}
          {tiles.length === 1 ? <div /> : null}
        </div>
      )}
    </div>
  );
}
