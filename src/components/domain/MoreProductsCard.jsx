import { moreProductDeckCards } from '../../lib/moreProductDeck';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppImage } from '../ui/AppImage';
import { formatMoney } from '../../lib/money';

function productImage(product) {
  return String(product?.image || product?.images?.[0] || '').trim();
}

function useDeckActivity(cardRef) {
  const [visible, setVisible] = useState(false);
  const [nearby, setNearby] = useState(false);
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

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver !== 'function') {
      setNearby(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setNearby(Boolean(entry?.isIntersecting)), {
      rootMargin: '600px 0px',
      threshold: 0,
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [cardRef]);

  return { nearby, playing: visible && !reducedMotion };
}

function miniCardStyle(role, playing) {
  const roles = {
    center: { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1, zIndex: 4 },
    left: { transform: 'translate3d(-34%, -27%, 0) rotate(-16deg) scale(.87)', opacity: .9, zIndex: 2 },
    right: { transform: 'translate3d(34%, -27%, 0) rotate(16deg) scale(.87)', opacity: .9, zIndex: 2 },
  };
  return {
    ...roles[role],
    position: 'absolute',
    left: '17%',
    bottom: '3%',
    width: '66%',
    height: '78%',
    overflow: 'hidden',
    border: '1px solid rgba(55, 22, 38, .10)',
    borderRadius: 13,
    background: 'var(--surface)',
    boxShadow: role === 'center' ? '0 14px 26px rgba(60, 24, 42, .22)' : '0 8px 18px rgba(60, 24, 42, .16)',
    transition: playing ? 'transform 560ms cubic-bezier(.22,.8,.24,1), opacity 420ms ease' : 'none',
    willChange: playing ? 'transform' : 'auto',
  };
}

function MiniProductCard({ product, role, playing }) {
  const image = productImage(product);
  const title = String(product?.title || product?.name || 'Букет').trim();
  return (
    <span style={miniCardStyle(role, playing)}>
      <AppImage src={image} alt="" loading="eager" fetchPriority="low" variant="thumb" sizes="140px"
        style={{ width: '100%', height: '62%', objectFit: 'cover', display: 'block', background: 'var(--surface-2)' }} />
      <span style={{ height: '38%', padding: '6px 7px 7px', display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: 'var(--text)', fontSize: 10, fontWeight: 850, lineHeight: 1.08 }}>{title}</span>
        <span style={{ marginTop: 'auto', color: 'var(--accent)', fontSize: 10, fontWeight: 1000, whiteSpace: 'nowrap' }}>{formatMoney(product?.price)}</span>
      </span>
    </span>
  );
}

export function MoreProductsCard({ products, coverImage, href, collectionTitle, label = 'Показать все' }) {
  const images = useMemo(() => [...new Set((products || []).map(productImage).filter(Boolean))].slice(0, 4), [products]);
  const cardRef = useRef(null);
  const { nearby, playing } = useDeckActivity(cardRef);
  const failedImages = useRef(new Set());
  const [loadedImages, setLoadedImages] = useState([]);
  const [active, setActive] = useState(0);
  const readyImages = useMemo(() => images.filter((src) => loadedImages.includes(src)), [images, loadedImages]);
  const readyProducts = useMemo(() => (products || []).filter((product) => readyImages.includes(productImage(product))).slice(0, 4), [products, readyImages]);

  useEffect(() => {
    setLoadedImages((current) => current.filter((src) => images.includes(src)));
    failedImages.current = new Set([...failedImages.current].filter((src) => images.includes(src)));
    setActive(0);
  }, [images]);

  useEffect(() => {
    if (!playing || readyProducts.length < 2) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % readyProducts.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing, readyProducts.length]);

  if (!images.length && !coverImage) return null;
  const safeActive = readyProducts.length ? active % readyProducts.length : 0;
  const visibleCards = moreProductDeckCards(readyProducts, safeActive);
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
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
          background: 'linear-gradient(145deg, var(--surface-2), rgba(244, 194, 209, .42))',
        }}
      >
        {!readyProducts.length && coverImage ? (
          <span style={{ ...miniCardStyle('center', false), height: '84%' }}>
            <AppImage src={coverImage} alt="" loading="lazy" fetchPriority="low" variant="card" width={320} height={320}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </span>
        ) : null}
        {visibleCards.map(({ product, role }) => (
          <MiniProductCard key={product.id ?? productImage(product)} product={product} role={role} playing={playing} />
        ))}
        {nearby ? images.filter((src) => !readyImages.includes(src) && !failedImages.current.has(src)).map((src) => (
          <AppImage key={`prewarm-${src}`} src={src} alt="" loading="eager" fetchPriority="low" variant="thumb" sizes="140px"
            onLoad={() => {
              if (failedImages.current.has(src)) return;
              setLoadedImages((current) => current.includes(src) ? current : [...current, src]);
            }}
            onError={(event) => {
              const selected = String(event.currentTarget?.currentSrc || event.currentTarget?.src || '');
              if (!/@\d+\.(?:avif|webp)(?:[?#]|$)/i.test(selected)) failedImages.current.add(src);
            }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        )) : null}
      </span>

      <span style={{ padding: 10, flexShrink: 0 }}>
        <span style={{ width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, whiteSpace: 'nowrap', background: 'var(--accent)', color: 'var(--c-accent-contrast)', boxShadow: 'var(--shadow-accent)', fontSize: 14, fontWeight: 1000 }}>
          {label}
          <ChevronRight aria-hidden="true" size={18} strokeWidth={3} />
        </span>
      </span>
    </Link>
  );
}
