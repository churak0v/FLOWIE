import React, { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { cx } from '../../lib/cx';

const SCROLL_POSITIONS = new Map();

export function AppShell({ className, style, children }) {
  const location = useLocation();
  // Use pathname+search (not location.key) so tab switching preserves scroll and doesn't feel like a full reload.
  const restoreKey = useMemo(() => `${location.pathname}${location.search}`, [location.pathname, location.search]);

  useEffect(() => {
    const y = SCROLL_POSITIONS.get(restoreKey);
    // Restore after layout, otherwise it can be clamped to 0 during mount.
    requestAnimationFrame(() => {
      try {
        window.scrollTo(0, typeof y === 'number' ? y : 0);
      } catch {
        // ignore
      }
    });

    const onScroll = () => {
      SCROLL_POSITIONS.set(restoreKey, window.scrollY);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [restoreKey]);

  return (
    <div className={cx('ui-appShell', className)} style={style}>
      {children}
    </div>
  );
}
