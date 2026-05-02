import React from 'react';
import { cx } from '../../lib/cx';

const VARIANT_CLASS = {
  title: 'ui-text-title',
  subtitle: 'ui-text-subtitle',
  body: 'ui-text-body',
  caption: 'ui-text-caption',
};

export function Text({
  as: As = 'div',
  variant = 'body',
  muted = false,
  className,
  style,
  children,
  ...props
}) {
  return (
    <As
      className={cx(VARIANT_CLASS[variant] || VARIANT_CLASS.body, className)}
      style={{
        ...(muted ? { color: 'var(--c-text-muted)' } : null),
        ...style,
      }}
      {...props}
    >
      {children}
    </As>
  );
}

