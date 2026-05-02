import React from 'react';
import { Plus } from 'lucide-react';
import { Carousel } from '../ui/Carousel';
import { AppImage } from '../ui/AppImage';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

function RecipientCard({ recipient, selected, onClick }) {
  const hasImage = Boolean(recipient?.image);
  return (
    <Surface
      variant="soft"
      border
      onClick={onClick}
      style={{
        width: 'clamp(150px, 42vw, 200px)',
        flexShrink: 0,
        padding: 14,
        borderRadius: 26,
        cursor: 'pointer',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: selected ? '0 6px 20px rgba(0,0,0,0.10)' : 'var(--shadow-1)',
        boxSizing: 'border-box',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '999px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0,
          }}
        >
          {hasImage ? (
            <AppImage
              src={recipient.image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>
          <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {recipient.name}
          </Text>
          <div style={{ marginTop: 4 }}>
            <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {recipient.relation || recipient.phone || 'Профиль'}
            </Text>
          </div>
        </div>
      </div>
    </Surface>
  );
}

export function RecipientSelector({ recipients, selectedId, onSelect, onAddClick, title = 'Получатель' }) {
  const list = Array.isArray(recipients) ? recipients : [];

  return (
    <div>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        {title}
      </Text>

      {list.length ? (
        <Carousel>
          {list.map((r) => (
            <RecipientCard key={r.id} recipient={r} selected={r.id === selectedId} onClick={() => onSelect?.(r.id)} />
          ))}
          <Surface
            variant="soft"
            onClick={() => onAddClick?.()}
            style={{
              width: 'clamp(150px, 42vw, 200px)',
              flexShrink: 0,
              padding: 14,
              borderRadius: 'var(--r-lg)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--accent)',
              fontWeight: 900,
            }}
          >
            <Plus size={18} />
            Добавить
          </Surface>
        </Carousel>
      ) : (
        <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
          <Text variant="subtitle">Добавьте получателя</Text>
          <div style={{ marginTop: 6 }}>
            <Text variant="body" muted>
              Это упростит оформление следующих заказов.
            </Text>
          </div>
          <button
            type="button"
            onClick={() => onAddClick?.()}
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
            Добавить
          </button>
        </Surface>
      )}
    </div>
  );
}
