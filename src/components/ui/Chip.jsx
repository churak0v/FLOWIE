import React from 'react';
import { cx } from '../../lib/cx';

export function Chip({ tone = 'default', className, icon, style, children, ...props }) {
  const clickable = typeof props.onClick === 'function';
  const As = clickable ? 'button' : 'span';

  return (
    <As
      className={cx(
        'ui-chip',
        tone === 'accent' && 'ui-chip--accent',
        tone === 'success' && 'ui-chip--success',
        className
      )}
      type={clickable ? 'button' : undefined}
      style={{
        ...(clickable ? { cursor: 'pointer' } : null),
        ...style,
      }}
      {...props}
    >
      {icon ? <span style={{ display: 'inline-flex' }}>{icon}</span> : null}
      {children}
    </As>
  );
}
