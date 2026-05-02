import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function BottomSheet({ open, onClose, overlay = true, closeOnOverlay = true, children }) {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {overlay ? <div className="ui-sheetOverlay" onClick={closeOnOverlay ? onClose : undefined} /> : null}
      <div className="ui-sheetPanel" role="dialog" aria-modal="true">
        <div className="ui-sheetHandle" />
        {children}
      </div>
    </>,
    document.body
  );
}
