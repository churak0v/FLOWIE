import React from 'react';
import { Shield } from 'lucide-react';

export function AdminTopBar({ title, user }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        padding: 'calc(var(--sp-4) + var(--app-inset-top)) var(--sp-4) var(--sp-4)',
        margin: 'calc(-1 * (var(--sp-4) + var(--app-inset-top))) calc(-1 * var(--sp-4)) 0',
        background: 'linear-gradient(to bottom, rgba(246,242,238,0.98), rgba(246,242,238,0.92))',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--c-ink-06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.01em' }}>{title}</div>
        <div
          className="ui-chip"
          style={{
            borderColor: 'transparent',
            background: 'var(--surface)',
          }}
        >
          <Shield size={16} />
          <span style={{ fontSize: 12, fontWeight: 900 }}>
            {user?.role ? String(user.role).toUpperCase() : 'STAFF'}
          </span>
        </div>
      </div>
    </div>
  );
}

