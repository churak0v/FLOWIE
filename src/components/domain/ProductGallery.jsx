import React, { useMemo, useState } from 'react';
import { AppImage } from '../ui/AppImage';

export function ProductGallery({ title, images }) {
  const gallery = useMemo(() => (images?.length ? images : []), [images]);
  const [active, setActive] = useState(0);

  return (
    <div>
      <AppImage
        src={gallery[active] || gallery[0]}
        alt={title}
        style={{
          width: '100%',
          aspectRatio: '1/1',
          objectFit: 'cover',
          borderRadius: 'var(--r-lg)',
        }}
      />

      {gallery.length > 1 ? (
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', marginTop: 12, padding: '2px 0' }}>
          {gallery.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActive(idx)}
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                opacity: idx === active ? 1 : 0.55,
              }}
            >
              <AppImage
                src={img}
                alt=""
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  objectFit: 'cover',
                  border: idx === active ? '2px solid var(--accent)' : '1px solid var(--border)',
                  boxShadow: idx === active ? '0 0 0 2px var(--accent)' : 'none',
                  boxSizing: 'border-box',
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
