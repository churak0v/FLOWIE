import React from 'react';
import { AppImage } from '../ui/AppImage';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

export function CategoryStrip({ categories }) {
  return (
    <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
      {(categories || []).map((cat) => (
        <div key={cat.id} style={{ width: 181, flexShrink: 0 }}>
          <Surface
            variant="flat"
            style={{
              width: 181,
              height: 183,
              borderRadius: 19,
              padding: 4,
              background: 'var(--c-surface)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '84px 84px',
                gridTemplateRows: '84px 84px',
                columnGap: 5,
                rowGap: 8,
              }}
            >
              {(cat.previewImages || []).slice(0, 4).map((img, idx) => (
                <AppImage
                  key={idx}
                  src={img}
                  alt={cat.title}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 19,
                    objectFit: 'cover',
                  }}
                />
              ))}
            </div>
          </Surface>

          <div style={{ marginTop: 8 }}>
            <Text variant="subtitle">{cat.title}</Text>
          </div>
        </div>
      ))}
    </div>
  );
}
