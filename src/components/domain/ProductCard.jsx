import { useMemo } from 'react';
import { Heart, Plus } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';
import { useAppState } from '../../state/AppState';
import { trackAnalytics } from '../../lib/analytics';

export function ProductCard({ id, title, price, image, images, onAdd, onOpen, view = 'grid' }) {
  const { state, actions } = useAppState();
  const isSaved = state.favorites.productIds.includes(id);
  const isList = view === 'list';
  const gallery = useMemo(() => {
    const seen = new Set();
    return [image, ...(Array.isArray(images) ? images : [])]
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });
  }, [image, images]);

  return (
    <Surface
      className="productCard"
      style={{
        height: '100%',
        padding: 0,
        cursor: onOpen ? 'pointer' : 'default',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: isList ? 'row' : 'column',
        borderRadius: 18,
        border: '1px solid rgba(13,13,13,0.07)',
        boxShadow: '0 16px 38px rgba(13,13,13,0.08)',
      }}
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
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: isList ? 'clamp(140px, 44vw, 172px)' : 'auto',
          alignSelf: 'stretch',
          minHeight: isList ? 'clamp(140px, 44vw, 172px)' : undefined,
          flexShrink: 0,
          background: 'var(--surface-2)',
          display: isList ? 'flex' : 'block',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppImage
          src={gallery[0] || image}
          alt={title}
          loading="lazy"
          fetchPriority="auto"
          style={{
            position: isList ? 'absolute' : undefined,
            inset: isList ? 0 : undefined,
            width: '100%',
            height: isList ? '100%' : 'auto',
            objectFit: 'cover',
            display: 'block',
          }}
        />

        {!isList ? <button
          type="button"
          aria-label={isSaved ? 'Убрать из сохранённого' : 'Сохранить'}
          onClick={(e) => {
            e.stopPropagation();
            trackAnalytics(isSaved ? 'favorite_remove' : 'favorite_add', { productId: id });
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
        </button> : null}
      </div>

      <div style={{ padding: isList ? 12 : 12, display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: 'var(--surface)' }}>

        <div
          style={{
            overflow: 'hidden',
            position: 'relative',
            display: isList ? 'flex' : 'block',
            alignItems: isList ? 'flex-start' : undefined,
            gap: isList ? 8 : undefined,
          }}
        >
          <Text
            variant="subtitle"
            style={{
              display: isList ? 'block' : '-webkit-box',
              height: isList ? 'auto' : '3.48em',
              flex: isList ? 1 : undefined,
              flexShrink: 0,
              WebkitLineClamp: isList ? undefined : 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.16,
              letterSpacing: 0,
            }}
          >
            {title}
          </Text>

          {isList ? (
            <button
              type="button"
              aria-label={isSaved ? 'Убрать из сохранённого' : 'Сохранить'}
              onClick={(event) => {
                event.stopPropagation();
                trackAnalytics(isSaved ? 'favorite_remove' : 'favorite_add', { productId: id });
                actions.toggleFavoriteProduct(id);
              }}
              style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, border: '1px solid var(--border)', background: isSaved ? 'var(--c-accent-10)' : 'var(--surface)', color: isSaved ? 'var(--accent)' : 'var(--text)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <Heart size={18} strokeWidth={2.5} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          ) : null}

        </div>
        <div style={{ marginTop: 'auto', paddingTop: isList ? 12 : 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              height: 34,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--c-accent-10)',
              border: '1px solid var(--c-accent-border)',
              color: 'var(--accent)',
              fontWeight: 1000,
              fontSize: 15,
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {formatMoney(price)}
          </div>

          <button
            type="button"
            aria-label="Добавить"
            onClick={(e) => {
              e.stopPropagation();
              onAdd?.(id);
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: 0,
              background: 'var(--c-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              marginLeft: 'auto',
              boxShadow: 'var(--shadow-accent)',
            }}
          >
            <Plus size={20} color="var(--c-accent-contrast)" strokeWidth={3} />
          </button>
        </div>
      </div>
    </Surface>
  );
}
