import React from 'react';
import { cx } from '../../lib/cx';

export function Grid({ className, children, ...props }) {
  return (
    <div className={cx('ui-grid2', className)} {...props}>
      {children}
    </div>
  );
}

