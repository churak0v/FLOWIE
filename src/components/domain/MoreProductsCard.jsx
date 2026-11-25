import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppImage } from '../ui/AppImage';
import { Text } from '../ui/Text';

function productImage(product) {
  return String(product?.image || product?.images?.[0] || '').trim();
}

export function MoreProductsCard({ products, href, collectionTitle, label = 'Показать все' }) {
  const images = (products || []).map(productImage).filter(Boolean).slice(0, 4);
  if (!images.length) return null;
  const query = new URL(href, 'https://flowie.art').searchParams;
  const floor = query.get('min');
  const bannerId = floor && /^\d{1,6}$/.test(floor) ? `home-more-from-${floor}` : query.has('search') || query.has('flower') ? 'home-more-roses' : 'home-more-catalog';

  return (
    <Link
      to={href}
      aria-label={`${label}: ${collectionTitle || 'открыть подборку'}`}
      data-analytics-impression="banner"
      data-analytics-banner={bannerId}
      data-analytics-placement="home_recommendations"
      style={{
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 18,
        border: '1px solid rgba(13,13,13,0.07)',
        background: 'var(--surface)',
        color: 'var(--text)',
        textDecoration: 'none',
        boxShadow: '0 16px 38px rgba(13,13,13,0.08)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: 2,
          overflow: 'hidden',
          background: 'var(--surface-2)',
        }}
      >
        {Array.from({ length: 4 }, (_, index) => {
          const src = images[index % images.length];
          return <AppImage key={`${src}-${index}`} src={src} alt="" loading="lazy" variant="card" width={320} height={320} style={{ width: '100%', height: '100%', minWidth: 0, objectFit: 'cover', display: 'block' }} />;
        })}
      </span>

      <span style={{ padding: 14, minWidth: 0, display: 'flex', flex: 1, alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="subtitle" style={{ minWidth: 0, lineHeight: 1.16 }}>{label}</Text>
        <span aria-hidden="true" style={{ width: 34, height: 34, marginTop: -6, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--accent)', color: 'var(--c-accent-contrast)', boxShadow: 'var(--shadow-accent)' }}>
          <ChevronRight size={19} strokeWidth={3} />
        </span>
      </span>
    </Link>
  );
}
