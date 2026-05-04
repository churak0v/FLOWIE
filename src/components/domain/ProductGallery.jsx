import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AppImage } from '../ui/AppImage';

export function ProductGallery({ title, images }) {
  const gallery = useMemo(() => {
    const seen = new Set();
    return (images || [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .filter((x) => {
        if (seen.has(x)) return false;
        seen.add(x);
        return true;
      });
  }, [images]);
  const [active, setActive] = useState(0);
  const scrollerRef = useRef(null);

  const goTo = (idx) => {
    const next = Math.max(0, Math.min(gallery.length - 1, idx));
    setActive(next);
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div>
      <div
        ref={scrollerRef}
        className="hide-scrollbar"
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== active) setActive(next);
        }}
        style={{
          width: '100%',
          display: 'flex',
          overflowX: gallery.length > 1 ? 'auto' : 'hidden',
          scrollSnapType: gallery.length > 1 ? 'x mandatory' : undefined,
          borderRadius: 'var(--r-xl)',
          boxShadow: '0 18px 46px rgba(13,13,13,0.08)',
          background: 'var(--surface-2)',
          position: 'relative',
        }}
      >
        {(gallery.length ? gallery : ['']).map((img, idx) => (
          <AppImage
            key={`${img || 'empty'}:${idx}`}
            src={img}
            alt={idx === 0 ? title : `${title} ${idx + 1}`}
            loading="eager"
            fetchPriority={idx === 0 ? 'high' : 'auto'}
            style={{
              width: '100%',
              minWidth: '100%',
              aspectRatio: '1 / 1',
              objectFit: 'cover',
              scrollSnapAlign: 'start',
            }}
          />
        ))}
      </div>

      {gallery.length > 1 ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -46, padding: '0 10px', position: 'relative', zIndex: 2 }}>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => goTo(active - 1)}
              disabled={active <= 0}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: 0,
                background: 'rgba(255,255,255,0.82)',
                color: 'var(--text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: active <= 0 ? 0.42 : 1,
                cursor: active <= 0 ? 'default' : 'pointer',
                backdropFilter: 'blur(10px)',
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => goTo(active + 1)}
              disabled={active >= gallery.length - 1}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: 0,
                background: 'rgba(255,255,255,0.82)',
                color: 'var(--text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: active >= gallery.length - 1 ? 0.42 : 1,
                cursor: active >= gallery.length - 1 ? 'default' : 'pointer',
                backdropFilter: 'blur(10px)',
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
            {gallery.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Show image ${idx + 1}`}
                onClick={() => goTo(idx)}
                style={{
                  width: idx === active ? 18 : 7,
                  height: 7,
                  border: 0,
                  borderRadius: 999,
                  background: idx === active ? 'var(--accent)' : 'var(--c-ink-18)',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'width 160ms ease, background 160ms ease',
                }}
              />
            ))}
          </div>
        </>
      ) : null}

      {gallery.length > 1 ? (
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', marginTop: 12, padding: '3px 1px 5px' }}>
          {gallery.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goTo(idx)}
              style={{
                width: 70,
                height: 70,
                border: idx === active ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 22,
                background: 'transparent',
                padding: 4,
                cursor: 'pointer',
                opacity: idx === active ? 1 : 0.55,
                boxSizing: 'border-box',
                flexShrink: 0,
              }}
            >
              <AppImage
                src={img}
                alt=""
                loading="eager"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 17,
                  objectFit: 'cover',
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
