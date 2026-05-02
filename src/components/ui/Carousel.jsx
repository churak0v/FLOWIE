import React from 'react';

export function Carousel({ children, gap = 12, style }) {
  return (
    <div
      className="hide-scrollbar"
      style={{
        display: 'flex',
        gap,
        overflowX: 'auto',
        paddingBottom: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

