import React from 'react';
import { cx } from '../../lib/cx';

export function StickyBar({ className, innerClassName, children, ...props }) {
  return (
    <div className={cx('ui-stickyBar', className)} {...props}>
      <div className={cx('ui-stickyBarInner', innerClassName)}>{children}</div>
    </div>
  );
}

