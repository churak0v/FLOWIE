import React from 'react';
import { MessageCircle, Repeat } from 'lucide-react';
import { Text } from '../ui/Text';

function Action({ tone = 'neutral', icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          width: 59,
          height: 59,
          borderRadius: 'var(--r-pill)',
          background: tone === 'accent' ? 'var(--c-accent-2)' : 'var(--c-ink-12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <Text variant="caption" style={{ textAlign: 'center', whiteSpace: 'pre-line' }}>
        {label}
      </Text>
    </button>
  );
}

export function QuickActions({ onTip, onContact, onRepeat }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
      <Action
        tone="accent"
        icon={<span style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-white)' }}>₽</span>}
        label={'Оставить\nчаевые'}
        onClick={onTip}
      />
      <Action
        icon={<MessageCircle size={28} color="var(--c-ink-92)" fill="var(--c-ink-92)" />}
        label={'Связаться\nс нами'}
        onClick={onContact}
      />
      <Action icon={<Repeat size={28} color="var(--c-ink-92)" />} label={'Повторить\nзаказ'} onClick={onRepeat} />
    </div>
  );
}
