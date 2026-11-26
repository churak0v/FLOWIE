import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function BottomSheet({ open, onClose, overlay = true, closeOnOverlay = true, ariaLabel = 'Диалог', initialFocus = 'auto', children }) {
  const panelRef = useRef(null);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const vv = window.visualViewport;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = vv?.height || window.innerHeight;
        const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
        const hidden = Math.max(0, layoutHeight - height - (vv?.offsetTop || 0));
        const editing = panelRef.current?.contains(document.activeElement) && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
        setViewport({ bottom: editing && hidden > 120 ? hidden : 0, maxHeight: Math.max(160, height - 24), keyboard: Boolean(editing && hidden > 120) });
      });
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [open]);
  const returnFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const focusable = () => [...(panelRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
      .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocus === 'panel' ? panelRef.current : panelRef.current?.querySelector('[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (target || panelRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return createPortal(
    <>
      {overlay ? <div className="ui-sheetOverlay" onClick={closeOnOverlay ? onClose : undefined} /> : null}
      <div ref={panelRef} className="ui-sheetPanel" style={viewport ? { bottom: viewport.bottom, maxHeight: viewport.maxHeight, ...(viewport.keyboard ? { paddingBottom: 16 } : {}) } : undefined} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>
        <div className="ui-sheetHandle" />
        {children}
      </div>
    </>,
    document.body
  );
}
