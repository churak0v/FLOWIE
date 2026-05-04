import React, { useMemo, useState } from 'react';

function normalizeAssetUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (s.startsWith('/')) return s;
  // Treat relative asset paths as root-relative so they work on nested routes like /product/:id.
  return `/${s}`;
}

const DEFAULT_FALLBACK =
  'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=1200&q=80';

export function AppImage({ src, alt = '', fallback = DEFAULT_FALLBACK, onError, ...props }) {
  const [failed, setFailed] = useState(false);

  const finalSrc = useMemo(() => {
    const s = normalizeAssetUrl(src);
    const fb = normalizeAssetUrl(fallback) || DEFAULT_FALLBACK;
    if (!s) return fb;
    return failed ? fb : s;
  }, [failed, fallback, src]);

  return (
    <img
      {...props}
      src={finalSrc}
      alt={alt}
      loading={props.loading || 'eager'}
      decoding={props.decoding || 'async'}
      referrerPolicy="no-referrer"
      onError={(e) => {
        if (!failed) setFailed(true);
        onError?.(e);
      }}
    />
  );
}
