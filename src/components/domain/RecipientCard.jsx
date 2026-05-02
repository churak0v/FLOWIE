import React from 'react';
import { Pin, X } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

export function RecipientCard({
  id,
  name,
  relation,
  avatar,
  isAddNew,
  isSelected,
  onClick,
  onToggleFavorite,
  isFavorite,
  onDelete,
}) {
  if (isAddNew) {
    return (
      <Surface
        variant="flat"
        style={{
          width: 174,
          flexShrink: 0,
          background: 'var(--c-surface)',
          borderRadius: 'var(--r-xl)',
          height: 174,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClick?.();
        }}
      >
        <span style={{ fontSize: 96, fontWeight: 800, color: 'var(--c-accent)', lineHeight: 0.8 }}>
          +
        </span>
      </Surface>
    );
  }

  return (
    <div style={{ width: 168, flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={onClick}
          style={{
            width: 168,
            border: 0,
            padding: 0,
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          <img
            src={avatar}
            alt={name}
            style={{
              width: 168,
              height: 174,
              borderRadius: 'var(--r-lg)',
              objectFit: 'cover',
              border: isSelected ? '3px solid var(--c-accent-outline)' : '3px solid transparent',
              boxSizing: 'border-box',
            }}
          />
        </button>

        {typeof isFavorite === 'boolean' && onToggleFavorite ? (
          <button
            type="button"
            aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(id);
            }}
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              width: 32,
              height: 32,
              borderRadius: 'var(--r-pill)',
              border: 0,
              background: 'var(--c-white-75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Pin
              size={18}
              color={isFavorite ? 'var(--c-accent)' : 'var(--c-ink-40)'}
              fill={isFavorite ? 'var(--c-accent)' : 'transparent'}
            />
          </button>
        ) : null}

        {onDelete ? (
          <button
            type="button"
            aria-label="Удалить"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(id);
            }}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 32,
              height: 32,
              borderRadius: 'var(--r-pill)',
              border: 0,
              background: 'var(--c-white-75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} color="var(--c-ink-55)" />
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <Text variant="subtitle">{name}</Text>
        {relation ? (
          <div style={{ marginTop: 2 }}>
            <Text variant="body" muted style={{ fontWeight: 700 }}>
              {relation}
            </Text>
          </div>
        ) : null}
      </div>
    </div>
  );
}
