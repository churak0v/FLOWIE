import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { cx } from '../../lib/cx';

const SCROLL_POSITIONS = new Map();

export function AppShell({ className, style, children }) {
  const ref = useRef(null);
  const location = useLocation();
  // Use pathname+search (not location.key) so tab switching preserves scroll and doesn't feel like a full reload.
  const restoreKey = useMemo(() => `${location.pathname}${location.search}`, [location.pathname, location.search]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const y = SCROLL_POSITIONS.get(restoreKey);
    // Restore after layout, otherwise it can be clamped to 0 during mount.
    requestAnimationFrame(() => {
      try {
        el.scrollTop = typeof y === 'number' ? y : 0;
      } catch {
        // ignore
      }
    });

    const onScroll = () => {
      SCROLL_POSITIONS.set(restoreKey, el.scrollTop);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [restoreKey]);

  return (
    <div ref={ref} className={cx('ui-appShell', className)} style={style}>
      {children}
    </div>
  );
}
