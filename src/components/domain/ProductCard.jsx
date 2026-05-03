import React from 'react';
import { Heart, Plus } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';
import { useAppState } from '../../state/AppState';

export function ProductCard({ id, title, subtitle, price, image, onAdd, onOpen }) {
  const { state, actions } = useAppState();
  const isSaved = state.favorites.productIds.includes(id);

  return (
    <Surface
      className="productCard"
      style={{ height: '100%', padding: 0, cursor: onOpen ? 'pointer' : 'default', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      onClick={onOpen ? () => onOpen(id) : undefined}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter') onOpen(id);
            }
          : undefined
      }
    >
      <div style={{ position: 'relative' }}>
        <AppImage
          src={image}
          alt={title}
          loading="lazy"
          style={{
            width: '100%',
            aspectRatio: '1/1',
            objectFit: 'cover',
          }}
        />

        <button
          type="button"
          aria-label={isSaved ? 'Remove from saved' : 'Save item'}
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleFavoriteProduct(id);
          }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 36,
            height: 36,
            borderRadius: 999,
            border: isSaved ? '1px solid var(--c-accent-border)' : '1px solid rgba(255, 255, 255, 0.72)',
            background: isSaved ? 'var(--c-white)' : 'rgba(255, 255, 255, 0.82)',
            color: isSaved ? 'var(--accent)' : 'var(--c-ink-72)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 10px 24px rgba(17, 17, 17, 0.14)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <Heart size={19} strokeWidth={2.5} fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div
          style={{
            minHeight: 88,
            maxHeight: 88,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Text
            variant="subtitle"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.18,
            }}
          >
            {title}
          </Text>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 22,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(255,255,255,0), var(--surface) 86%)',
            }}
          />
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              height: 31,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 12px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-accent)',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            {formatMoney(price)}
          </div>

          <button
            type="button"
            aria-label="Add"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(id);
            }}
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              border: 0,
              background: 'var(--c-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              boxShadow: 'var(--shadow-accent)',
            }}
          >
            <Plus size={20} color="var(--c-white)" strokeWidth={3} />
          </button>
        </div>
      </div>
    </Surface>
  );
}
