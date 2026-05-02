import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

function CollectionCard({ title, images, onClick }) {
  return (
    <div style={{ width: 181, flexShrink: 0 }}>
      <Surface
        variant="soft"
        onClick={onClick}
        style={{
          width: 181,
          height: 181,
          borderRadius: 'var(--r-md)',
          padding: 10,
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(images || []).slice(0, 3).map((img, idx) => (
            <AppImage
              key={idx}
              src={img}
              alt=""
              style={{
                width: '100%',
                aspectRatio: '1/1',
                objectFit: 'cover',
                borderRadius: 16,
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 32,
            height: 32,
            borderRadius: 'var(--r-pill)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight size={18} color="var(--c-ink-92)" />
        </div>
      </Surface>

      <div style={{ marginTop: 10 }}>
        <Text variant="subtitle">{title}</Text>
      </div>
    </div>
  );
}

export function CollectionsGrid({ collections, productsById }) {
  const navigate = useNavigate();

  return (
    <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
      {(collections || []).map((c) => {
        const images = (c.productIds || []).map((id) => productsById[id]?.image).filter(Boolean);
        const key = c.slug || c.id;
        const qp = c.slug || c.id;
        return (
          <CollectionCard
            key={key}
            title={c.title}
            images={images}
            onClick={() => navigate(`/catalog?collection=${encodeURIComponent(qp)}`)}
          />
        );
      })}
    </div>
  );
}
