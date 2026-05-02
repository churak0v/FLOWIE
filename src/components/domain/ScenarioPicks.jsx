import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

function ScenarioCard({ title, description, images, onClick }) {
  return (
    <Surface
      variant="soft"
      onClick={onClick}
      style={{
        padding: 14,
        borderRadius: 'var(--r-lg)',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Text variant="subtitle">{title}</Text>
        <div style={{ marginTop: 6 }}>
          <Text variant="body" muted>
            {description}
          </Text>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {(images || []).slice(0, 3).map((img, idx) => (
          <AppImage
            key={idx}
            src={img}
            alt=""
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              objectFit: 'cover',
              opacity: idx === 0 ? 1 : 0.9,
            }}
          />
        ))}
      </div>
    </Surface>
  );
}

export function ScenarioPicks({ scenarios, productsById }) {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {(scenarios || []).map((s) => {
        const images = (s.productIds || []).map((id) => productsById[id]?.image).filter(Boolean);
        const key = s.slug || s.id;
        const qp = s.slug || s.id;
        return (
          <ScenarioCard
            key={key}
            title={s.title}
            description={s.description}
            images={images}
            onClick={() => navigate(`/catalog?scenario=${encodeURIComponent(qp)}`)}
          />
        );
      })}
    </div>
  );
}
