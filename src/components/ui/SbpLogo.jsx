import React from 'react';

export function SbpLogo({ compact = false }) {
  return (
    <span
      aria-label="СБП"
      style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 7, flex: '0 0 auto' }}
    >
      <svg width={compact ? 24 : 28} height={compact ? 24 : 28} viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 2.5 16 16 3 29.5Z" fill="#18B982" />
        <path d="M3 2.5 28 9.2 16 16Z" fill="#F13C73" />
        <path d="M16 16 28 9.2 28 22.8Z" fill="#6D59E8" />
        <path d="M3 29.5 16 16 28 22.8Z" fill="#00A6D8" />
      </svg>
      <span style={{ fontSize: compact ? 21 : 24, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.04em' }}>сбп</span>
    </span>
  );
}
