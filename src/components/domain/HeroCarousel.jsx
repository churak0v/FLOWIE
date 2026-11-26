import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { AppImage } from '../ui/AppImage';
import { trackAnalytics } from '../../lib/analytics';
import { isActuallyVisible } from '../../lib/heroImpression';

const HERO_IMPRESSION_DWELL_MS = 1_000;

function isVideoSrc(src) {
  return /\.mp4($|[?#])/i.test(String(src || '').trim());
}

function slideMediaKey(slide, index) {
  return `${slide?.id || index}:${slide?.video || slide?.image || ''}`;
}

export function HeroCarousel({ slides, className }) {
  const navigate = useNavigate();
  const safeSlides = useMemo(() => slides?.filter(Boolean) || [], [slides]);
  const [active, setActive] = useState(0);
  const [readyMedia, setReadyMedia] = useState(() => new Set());
  const readyMediaRef = useRef(new Set());
  const scrollerRef = useRef(null);
  const activeOfferRef = useRef(null);
  const impressedSlidesRef = useRef(new Set());

  const markMediaReady = (slide, index) => {
    const key = slideMediaKey(slide, index);
    if (readyMediaRef.current.has(key)) return;
    const next = new Set(readyMediaRef.current);
    next.add(key);
    readyMediaRef.current = next;
    setReadyMedia(next);
  };

  function openSlide(slide) {
    if (!slide?.href && typeof slide?.onAction !== 'function') return;
    trackAnalytics('home_banner_click', { meta: { bannerId: String(slide.analyticsBannerId || slide.id || '') } });
    if (typeof slide.onAction === 'function') {
      slide.onAction();
      return;
    }
    navigate(slide.href);
  }

  useEffect(() => {
    if (active < safeSlides.length) return;
    setActive(0);
    scrollerRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [active, safeSlides.length]);

  useEffect(() => {
    if (safeSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % safeSlides.length;
      if (!readyMediaRef.current.has(slideMediaKey(safeSlides[next], next))) return;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 5200);
    return () => window.clearInterval(timer);
  }, [safeSlides]);

  useEffect(() => {
    const slide = safeSlides[active];
    const key = slideMediaKey(slide, active);
    if (typeof slide?.onImpression !== 'function' || !readyMedia.has(key) || impressedSlidesRef.current.has(key)) return undefined;

    let dwellTimer = 0;
    let finished = false;
    const clearDwell = () => {
      if (dwellTimer) window.clearTimeout(dwellTimer);
      dwellTimer = 0;
    };
    const actuallyVisible = () => isActuallyVisible(activeOfferRef.current, {
      occlusionRoot: scrollerRef.current?.parentElement,
    });
    const audit = () => {
      if (finished || !actuallyVisible()) {
        clearDwell();
        return;
      }
      if (dwellTimer) return;
      dwellTimer = window.setTimeout(async () => {
        dwellTimer = 0;
        if (finished || !actuallyVisible()) return;
        let recorded = false;
        try {
          recorded = await slide.onImpression();
        } catch {
          return;
        }
        if (finished || recorded === false) return;
        impressedSlidesRef.current.add(key);
        finished = true;
      }, HERO_IMPRESSION_DWELL_MS);
    };

    const interval = window.setInterval(audit, 250);
    window.addEventListener('scroll', audit, { passive: true, capture: true });
    window.addEventListener('resize', audit, { passive: true });
    window.addEventListener('focus', audit);
    window.addEventListener('blur', audit);
    document.addEventListener('visibilitychange', audit);
    audit();
    return () => {
      finished = true;
      clearDwell();
      window.clearInterval(interval);
      window.removeEventListener('scroll', audit, { capture: true });
      window.removeEventListener('resize', audit);
      window.removeEventListener('focus', audit);
      window.removeEventListener('blur', audit);
      document.removeEventListener('visibilitychange', audit);
    };
  }, [active, readyMedia, safeSlides]);

  const nextToPrepare = safeSlides.length > 1 ? (active + 1) % safeSlides.length : active;

  return (
    <div
      className={cx(className)}
      role={!safeSlides.length ? 'status' : undefined}
      aria-busy={!safeSlides.length}
      aria-label={!safeSlides.length ? 'Загружаем актуальные баннеры' : undefined}
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 0,
        background: 'linear-gradient(145deg, var(--c-ink-06), var(--c-ink-14))',
      }}
    >
      <div
        ref={scrollerRef}
        className="hide-scrollbar"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const next = Math.max(0, Math.min(safeSlides.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
          if (next !== active) setActive(next);
        }}
        style={{
          height: '100%',
          display: 'flex',
          overflowX: safeSlides.length > 1 ? 'auto' : 'hidden',
          scrollSnapType: safeSlides.length > 1 ? 'x mandatory' : undefined,
        }}
      >
        {!safeSlides.length ? (
          <div
            aria-hidden="true"
            style={{
              minWidth: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.13), rgba(255,255,255,0.04))',
            }}
          />
        ) : null}
        {safeSlides.map((s, idx) => (
          <div
            key={s.id || idx}
            data-analytics-impression={s.analyticsBannerId ? 'banner' : undefined}
            data-analytics-banner={s.analyticsBannerId}
            data-analytics-placement={s.analyticsBannerId ? 'home_hero' : undefined}
            style={{
              minWidth: '100%',
              height: '100%',
              scrollSnapAlign: 'start',
              position: 'relative',
              background: 'var(--c-ink-06)',
            }}
          >
            {idx !== active && idx !== nextToPrepare && !readyMedia.has(slideMediaKey(s, idx)) ? null : s.video || isVideoSrc(s.image) ? (
              <video
                src={s.video || s.image}
                muted
                playsInline
                autoPlay={idx === active}
                loop
                preload={idx === active || idx === nextToPrepare ? 'auto' : 'metadata'}
                onCanPlay={() => markMediaReady(s, idx)}
                aria-hidden="true"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  display: 'block',
                }}
              />
            ) : (
              <AppImage
                src={s.image}
                alt=""
                aria-hidden="true"
                loading={idx === active || idx === nextToPrepare ? 'eager' : 'lazy'}
                fetchPriority={idx === 0 ? 'high' : 'auto'}
                onLoad={() => markMediaReady(s, idx)}
                variant="hero"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: s.imagePosition || 'center 66%',
                }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(40,20,25,0.10), rgba(40,20,25,0.16) 42%, rgba(40,20,25,0.58))' }} />
            {s.href || typeof s.onAction === 'function' ? <button type="button" aria-label={'Открыть баннер: ' + (s.caption || '')}
              tabIndex={idx === active ? 0 : -1} onClick={() => openSlide(s)}
              style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'transparent', border: 0,
                cursor: 'pointer', touchAction: 'pan-x' }} /> : null}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 'calc(var(--sp-4) + var(--app-inset-left))',
          top: 'calc(var(--sp-4) + var(--app-inset-top))',
          height: 34,
          padding: '0 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.82)',
          color: 'var(--text)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 12,
          fontWeight: 1000,
          boxShadow: '0 12px 28px rgba(13,13,13,0.18)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />
        Ижевск
      </div>

      {/* Caption + dots */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(var(--sp-4) + var(--app-inset-left))',
          right: 'calc(var(--sp-4) + var(--app-inset-right))',
          bottom: 'calc(var(--sp-8) + 4px)',
          color: 'var(--c-white)',
          textAlign: 'left',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        {!safeSlides[active]?.ctaLabel ? (
          <div style={{ maxWidth: 360, fontSize: 30, fontWeight: 1000, lineHeight: 1.02, letterSpacing: 0, textShadow: '0 2px 12px var(--c-ink-25)' }}>
            {safeSlides[active]?.caption || ''}
          </div>
        ) : null}

        {safeSlides[active]?.subtitle && !safeSlides[active]?.ctaLabel ? (
          <button
            type="button"
            onClick={() => {
              openSlide(safeSlides[active]);
            }}
            style={{
              marginTop: 10,
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: safeSlides[active]?.href || typeof safeSlides[active]?.onAction === 'function' ? 'pointer' : 'default',
              color: 'var(--c-white)',
              fontSize: 14,
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 6,
              maxWidth: 360,
              textAlign: 'left',
              opacity: safeSlides[active]?.href || typeof safeSlides[active]?.onAction === 'function' ? 1 : 0.9,
              textShadow: '0 2px 10px var(--c-ink-25)',
              pointerEvents: 'auto',
            }}
          >
            <span style={{ textAlign: 'left' }}>{safeSlides[active]?.subtitle}</span>
            {safeSlides[active]?.href || typeof safeSlides[active]?.onAction === 'function' ? (
              <span
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.88)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 22px rgba(0,0,0,0.22)',
                  backdropFilter: 'blur(10px)',
                  flexShrink: 0,
                }}
              >
                <ChevronRight size={18} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        ) : null}

        {safeSlides[active]?.ctaLabel ? (
          <div ref={activeOfferRef} style={{ display: 'inline-block', maxWidth: 360, pointerEvents: 'auto' }}>
            <div style={{ maxWidth: 360, fontSize: 30, fontWeight: 1000, lineHeight: 1.02, letterSpacing: 0, textShadow: '0 2px 12px var(--c-ink-25)' }}>
              {safeSlides[active].caption}
            </div>
            <div style={{ marginTop: 8, maxWidth: 310, color: 'var(--c-white)', fontSize: 14, fontWeight: 850, lineHeight: 1.25, textShadow: '0 2px 10px var(--c-ink-25)' }}>
              {safeSlides[active].subtitle}
            </div>
            <button
              type="button"
              onClick={() => openSlide(safeSlides[active])}
              style={{ marginTop: 12, minHeight: 40, padding: '0 16px', border: 0, borderRadius: 999, background: 'rgba(255,255,255,0.94)', color: '#4a2b25', fontSize: 14, fontWeight: 950, cursor: 'pointer', boxShadow: '0 9px 24px rgba(0,0,0,0.18)', pointerEvents: 'auto' }}
            >
              {safeSlides[active].ctaLabel}
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {safeSlides.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 'var(--r-pill)',
                background: i === active ? 'var(--c-white)' : 'var(--c-white-45)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
