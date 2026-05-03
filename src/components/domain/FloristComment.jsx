import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

export function FloristComment({ value, onChange }) {
  const [open, setOpen] = useState(Boolean(value));

  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text variant="subtitle">Gift note and delivery comment</Text>
        {open ? <ChevronUp size={18} color="var(--muted)" /> : <ChevronDown size={18} color="var(--muted)" />}
      </button>

      {open ? (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Example: keep the note short, neutral packaging, no price receipt..."
          style={{
            marginTop: 12,
            width: '100%',
            minHeight: 84,
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 12,
            background: 'var(--c-white)',
            resize: 'none',
          }}
        />
      ) : null}
    </Surface>
  );
}
