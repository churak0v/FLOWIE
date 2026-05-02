import React from 'react';
import { cx } from '../../lib/cx';

export function IconButton({ className, children, ...props }) {
  return (
    <button type="button" className={cx('ui-iconButton', className)} {...props}>
      {children}
    </button>
  );
}

