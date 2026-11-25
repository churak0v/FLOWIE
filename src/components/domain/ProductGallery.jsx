import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AppImage } from '../ui/AppImage';

export function ProductGallery({ title, images }) {
  const gallery = useMemo(() => {
    const seen = new Set();
    return (images || []).map((value) => String(value || '').trim()).filter(Boolean).filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }, [images]);
  const galleryKey = gallery.join('\u0000');
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    setActive(0);
    setViewerOpen(false);
    scrollerRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [galleryKey]);

  useEffect(() => {
    if (!viewerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setViewerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewerOpen]);

  const goTo = (index) => {
    const next = Math.max(0, Math.min(gallery.length - 1, index));
    setActive(next);
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTo({ left: next * scroller.clientWidth, behavior: 'smooth' });
  };

  const viewer = viewerOpen && gallery[active] && typeof document !== 'undefined'
    ? createPortal(
      <div role="dialog" aria-modal="true" aria-label={`Фото букета: ${title}`} onClick={() => setViewerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', padding: 'calc(56px + var(--app-inset-top)) calc(12px + var(--app-inset-right)) calc(24px + var(--app-inset-bottom)) calc(12px + var(--app-inset-left))', background: 'rgba(17, 11, 14, 0.94)' }}>
        <button type="button" aria-label="Закрыть просмотр фото" onClick={() => setViewerOpen(false)} style={{ position: 'absolute', top: 'calc(12px + var(--app-inset-top))', right: 'calc(12px + var(--app-inset-right))', width: 42, height: 42, border: 0, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.94)', color: 'var(--text)', cursor: 'pointer' }}>
          <X size={22} />
        </button>
        <AppImage src={gallery[active]} alt={`${title}, фото ${active + 1}`} variant="detail" onClick={(event) => event.stopPropagation()} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 18 }} />
      </div>,
      document.body,
    )
    : null;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: 'var(--surface-2)' }}>
        <div
          ref={scrollerRef}
          className="hide-scrollbar"
          onScroll={() => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            const next = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth));
            if (next !== active) setActive(next);
          }}
          style={{ width: '100%', height: '100%', display: 'flex', overflowX: gallery.length > 1 ? 'auto' : 'hidden', scrollSnapType: gallery.length > 1 ? 'x mandatory' : undefined, overscrollBehaviorX: 'contain' }}
        >
          {(gallery.length ? gallery : ['']).map((image, index) => (
            <button key={`${image || 'empty'}:${index}`} type="button" data-analytics-element="gallery_open" aria-label={`Открыть фото ${index + 1} целиком`} onClick={() => image && setViewerOpen(true)} disabled={!image} style={{ width: '100%', minWidth: '100%', height: '100%', padding: 0, border: 0, background: 'transparent', cursor: image ? 'zoom-in' : 'default', scrollSnapAlign: 'start', touchAction: 'auto' }}>
              <AppImage src={image} alt={index === 0 ? title : `${title}, фото ${index + 1}`} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} variant="detail" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
        {gallery.length > 1 ? <span aria-live="polite" style={{ position: 'absolute', right: 12, bottom: 12, minWidth: 42, height: 28, padding: '0 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.9)', color: 'var(--text)', fontSize: 12, fontWeight: 900, boxShadow: '0 8px 22px rgba(13,13,13,0.12)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>{active + 1}/{gallery.length}</span> : null}
      </div>

      {gallery.length > 1 ? (
        <div className="hide-scrollbar" aria-label="Фотографии букета" style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '10px 12px 3px', scrollPaddingInline: 12 }}>
          {gallery.map((image, index) => (
            <button key={image} type="button" data-analytics-element="gallery_thumbnail" aria-label={`Показать фото ${index + 1} из ${gallery.length}`} aria-pressed={index === active} onClick={() => goTo(index)} style={{ width: 58, height: 58, padding: 3, flexShrink: 0, overflow: 'hidden', borderRadius: 15, border: index === active ? '2px solid var(--accent)' : '1px solid var(--border)', background: 'var(--surface)', opacity: index === active ? 1 : 0.66, cursor: 'pointer', boxSizing: 'border-box' }}>
              <AppImage src={image} alt="" loading="lazy" variant="thumb" style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      ) : null}
      {viewer}
    </div>
  );
}
