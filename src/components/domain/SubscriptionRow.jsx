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

export function SubscriptionRow() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const recipients = state.recipients.items || [];

  const tiles = useMemo(() => {
    const list = recipients.filter(Boolean);

    if (list.length === 0) {
      return [
        { type: 'add', key: 'add' },
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

    if (t.type === 'add') {
      return <RecipientSquareTile variant="add" onClick={() => navigate('/recipients/new')} />;
    }

    if (t.type === 'recipient') {
      return (
        <RecipientSquareTile
          recipient={t.recipient}
          onClick={() => {
            actions.selectRecipient(t.recipient.id);
            navigate(`/recipients/${t.recipient.id}`);
          }}
        />
      );
    }

    return (
      <Tile onClick={() => alert('PASS (позже)')} style={{ position: 'relative', background: 'var(--c-accent-2)', color: 'var(--c-white)' }}>
        <span
          className="ui-chip"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            height: 24,
            padding: '0 10px',
            borderColor: 'rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.18)',
            color: 'var(--c-white)',
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          Скоро
        </span>
        <Text variant="subtitle" style={{ color: 'var(--c-white)' }}>
          Подписка
        </Text>
        <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, opacity: 0.92 }}>PASS</div>
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
                flex: '0 0 calc((100% - 24px) / 2.5)', // 2.5 карточки в ряд
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
