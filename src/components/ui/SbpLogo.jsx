import React from 'react';

export function SbpLogo({ compact = false }) {
  return (
    <img
      src="/assets/sbp-logo-white.png"
      alt="СБП"
      width={compact ? 78 : 92}
      height={compact ? 38 : 45}
      style={{ display: 'block', objectFit: 'contain', flex: '0 0 auto' }}
    />
  );
}
