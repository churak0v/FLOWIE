import React from 'react';
import { cx } from '../../lib/cx';

export function Surface({
  as: As = 'div',
  variant = 'default', // default | soft
  border = false,
  fullWidth = false,
  className,
  style,
  children,
  ...props
}) {
  const cls = cx(
    'ui-surface',
    (variant === 'soft' || variant === 'flat') && 'ui-surface--soft',
    className
  );

  return (
    <As
      className={cls}
      style={{
        boxSizing: 'border-box',
        ...(border ? { border: '1px solid var(--border)' } : null),
        ...(fullWidth ? { width: '100%' } : null),
        ...style,
      }}
      {...props}
    >
      {children}
    </As>
  );
}
