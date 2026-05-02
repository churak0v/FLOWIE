import React from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

export function RecipientSquareTile({ variant = 'recipient', recipient, title, subtitle, onClick }) {
  const clickable = typeof onClick === 'function';
  const name = title || recipient?.name || '';
  const image = recipient?.image || recipient?.avatar || '';

  if (variant === 'add') {
    return (
      <Surface
        variant="soft"
        onClick={onClick}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        style={{
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          aspectRatio: '1 / 1',
          minHeight: 140,
          padding: 14,
          cursor: clickable ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <div style={{ fontSize: 54, fontWeight: 900, color: 'var(--accent)', lineHeight: 1 }}>+</div>
        <Text variant="caption" style={{ color: 'var(--muted)' }}>
          {subtitle || 'Добавить получателя'}
        </Text>
      </Surface>
    );
  }

  return (
    <Surface
      variant="soft"
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        aspectRatio: '1 / 1',
        minHeight: 140,
        overflow: 'hidden',
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      <AppImage
        src={image}
        alt={name}
        fallback="https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: 10,
          background: 'rgba(255,255,255,0.82)',
          borderRadius: 999,
          padding: '8px 10px',
          border: '1px solid rgba(0,0,0,0.06)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Text variant="subtitle" style={{ textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </Text>
      </div>
    </Surface>
  );
}
