import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cx } from '../../lib/cx';
import { AppImage } from '../ui/AppImage';

function isVideoSrc(src) {
  return /\.mp4($|[?#])/i.test(String(src || '').trim());
}

export function HeroCarousel({ slides, className }) {
  const navigate = useNavigate();
  const safeSlides = useMemo(() => slides?.filter(Boolean) || [], [slides]);
  const [active, setActive] = useState(0);
  const scrollerRef = useRef(null);
  // The Home panel has a large top radius. We extend the hero underlay below the panel edge
  // so the rounded corners always reveal media (not the page background).
  const UNDERLAY_EXTRA_PX = 48;

  useEffect(() => {
    if (safeSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % safeSlides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
      setActive(next);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [safeSlides.length]);

  return (
    <div
      className={cx(className)}
      style={{
        position: 'relative',
        height: `calc(55vh + ${UNDERLAY_EXTRA_PX}px)`,
        minHeight: 360 + UNDERLAY_EXTRA_PX,
        overflow: 'hidden',
        borderRadius: 0,
      }}
    >
      <div
        ref={scrollerRef}
        className="hide-scrollbar"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const next = Math.round(el.scrollLeft / el.clientWidth);
          if (next !== active) setActive(next);
        }}
        style={{
          height: '100%',
          display: 'flex',
          overflowX: safeSlides.length > 1 ? 'auto' : 'hidden',
          scrollSnapType: safeSlides.length > 1 ? 'x mandatory' : undefined,
        }}
      >
        {safeSlides.map((s, idx) => (
          <div
            key={s.id || idx}
            style={{
              minWidth: '100%',
              height: '100%',
              scrollSnapAlign: 'start',
              position: 'relative',
              background: 'var(--c-ink-06)',
            }}
          >
            {s.video || isVideoSrc(s.image) ? (
              <video
                src={s.video || s.image}
                muted
                playsInline
                autoPlay
                loop
                preload="auto"
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
                loading={idx === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: s.imagePosition || 'center 66%',
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
              background: 'linear-gradient(180deg, rgba(40,20,25,0.10), rgba(40,20,25,0.16) 42%, rgba(40,20,25,0.58))',
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 'var(--sp-4)',
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
        FLOWIE букеты
      </div>

      {/* Caption + dots */}
      <div
        style={{
          position: 'absolute',
          left: 'var(--sp-4)',
          right: 'var(--sp-4)',
          // Keep caption in the same visual position even though the underlay is taller.
          bottom: `calc(var(--sp-6) + ${UNDERLAY_EXTRA_PX}px)`,
          color: 'var(--c-white)',
          textAlign: 'left',
        }}
      >
        <div style={{ maxWidth: 360, fontSize: 30, fontWeight: 1000, lineHeight: 1.02, letterSpacing: 0, textShadow: '0 2px 12px var(--c-ink-25)' }}>
          {safeSlides[active]?.caption || ''}
        </div>

        {safeSlides[active]?.subtitle ? (
          <button
            type="button"
            onClick={() => {
              const href = safeSlides[active]?.href;
              if (href) navigate(href);
            }}
            style={{
              marginTop: 10,
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: safeSlides[active]?.href ? 'pointer' : 'default',
              color: 'var(--c-white)',
              fontSize: 14,
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 6,
              maxWidth: 360,
              textAlign: 'left',
              opacity: safeSlides[active]?.href ? 1 : 0.9,
              textShadow: '0 2px 10px var(--c-ink-25)',
            }}
          >
            <span style={{ textAlign: 'left' }}>{safeSlides[active]?.subtitle}</span>
            {safeSlides[active]?.href ? (
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

        <div style={{ display: 'flex', gap: 6, marginTop: safeSlides[active]?.subtitle ? 10 : 10 }}>
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
