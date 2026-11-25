import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppImage } from '../ui/AppImage';
import { Text } from '../ui/Text';

function productImage(product) {
  return String(product?.image || product?.images?.[0] || '').trim();
}

function useDeckPlayback(cardRef) {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(Boolean(query?.matches));
    update();
    query?.addEventListener?.('change', update);
    return () => query?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.2));
    }, { threshold: [0, 0.2] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cardRef]);

  return visible && !reducedMotion;
}

function layerStyle(layer, playing) {
  const layers = [
    { transform: 'translate3d(0, 0, 0) rotate(-1.5deg) scale(1)', opacity: 1 },
    { transform: 'translate3d(-8px, 7px, 0) rotate(-5deg) scale(.96)', opacity: .88 },
    { transform: 'translate3d(9px, 11px, 0) rotate(5deg) scale(.92)', opacity: .72 },
    { transform: 'translate3d(2px, 15px, 0) rotate(1deg) scale(.88)', opacity: .5 },
  ];
  return {
    ...layers[layer],
    position: 'absolute',
    inset: '9% 10% 13%',
    zIndex: 10 - layer,
    overflow: 'hidden',
    border: '4px solid var(--surface)',
    borderRadius: 17,
    background: 'var(--surface-2)',
    boxShadow: layer === 0 ? '0 15px 30px rgba(60, 24, 42, .20)' : '0 8px 18px rgba(60, 24, 42, .12)',
    transition: playing ? 'transform 560ms cubic-bezier(.22,.8,.24,1), opacity 420ms ease' : 'none',
    willChange: playing ? 'transform' : 'auto',
  };
}

export function MoreProductsCard({ products, href, collectionTitle, label = 'Показать все' }) {
  const images = useMemo(() => [...new Set((products || []).map(productImage).filter(Boolean))].slice(0, 4), [products]);
  const cardRef = useRef(null);
  const playing = useDeckPlayback(cardRef);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!playing || images.length < 2) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % images.length), 2600);
    return () => window.clearInterval(timer);
  }, [images.length, playing]);

  if (!images.length) return null;
  const orderedImages = [...images.slice(active), ...images.slice(0, active)];
  const query = new URL(href, 'https://flowie.art').searchParams;
  const floor = query.get('min');
  const bannerId = floor && /^\d{1,6}$/.test(floor) ? `home-more-from-${floor}` : query.has('search') || query.has('flower') ? 'home-more-roses' : 'home-more-catalog';

  return (
    <Link
      ref={cardRef}
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
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          flexShrink: 0,
          overflow: 'hidden',
          background: 'linear-gradient(145deg, var(--surface-2), rgba(244, 194, 209, .42))',
        }}
      >
        {orderedImages.slice(0, 4).map((src, index) => {
          return <span key={src} style={layerStyle(index, playing)}>
            <AppImage src={src} alt="" loading="lazy" variant="card" width={320} height={320} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>;
        })}
      </span>

      <span style={{ padding: 14, minWidth: 0, display: 'flex', flex: 1, flexDirection: 'column' }}>
        <Text variant="subtitle" style={{ minWidth: 0, lineHeight: 1.16 }}>Ещё букеты</Text>
        <span style={{ minHeight: 36, marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, whiteSpace: 'nowrap', color: 'var(--accent)', fontSize: 12, fontWeight: 1000 }}>
          {label}
          <span aria-hidden="true" style={{ width: 30, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--accent)', color: 'var(--c-accent-contrast)', boxShadow: 'var(--shadow-accent)' }}>
            <ChevronRight size={19} strokeWidth={3} />
          </span>
        </span>
      </span>
    </Link>
  );
}
