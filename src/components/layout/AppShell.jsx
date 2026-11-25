import { useLayoutEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { cx } from '../../lib/cx';

const SCROLL_POSITIONS = new Map();

export function AppShell({ className, style, children }) {
  const location = useLocation();
  // Use pathname+search (not location.key) so tab switching preserves scroll and doesn't feel like a full reload.
  const restoreKey = useMemo(() => `${location.pathname}${location.search}`, [location.pathname, location.search]);

  useLayoutEffect(() => {
    const y = SCROLL_POSITIONS.get(restoreKey);
    // Card image frames already reserve their size. Restore before first paint,
    // rather than exposing an empty top-of-page frame while Safari schedules lazy images.
    try { window.scrollTo(0, typeof y === 'number' ? y : 0); } catch { /* keep native position */ }

    const onScroll = () => {
      SCROLL_POSITIONS.set(restoreKey, window.scrollY);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      SCROLL_POSITIONS.set(restoreKey, window.scrollY);
      window.removeEventListener('scroll', onScroll);
    };
  }, [restoreKey]);

  return (
    <div className={cx('ui-appShell', className)} style={style}>
      {children}
    </div>
  );
}
