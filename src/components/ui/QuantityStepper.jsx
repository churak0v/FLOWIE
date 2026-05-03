import React from 'react';

export function QuantityStepper({ value, onDec, onInc, min = 1, max = 99 }) {
  const canDec = value > min;
  const canInc = value < max;

  return (
    <div
      style={{
        height: 44,
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={canDec ? onDec : undefined}
        disabled={!canDec}
        aria-label="Decrease"
        style={{
          width: 44,
          height: 44,
          border: 0,
          background: 'transparent',
          cursor: canDec ? 'pointer' : 'default',
          color: 'var(--text)',
          opacity: canDec ? 1 : 0.35,
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        -
      </button>

      <div
        style={{
          width: 44,
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        {value}
      </div>

      <button
        type="button"
        onClick={canInc ? onInc : undefined}
        disabled={!canInc}
        aria-label="Increase"
        style={{
          width: 44,
          height: 44,
          border: 0,
          background: 'transparent',
          cursor: canInc ? 'pointer' : 'default',
          color: 'var(--text)',
          opacity: canInc ? 1 : 0.35,
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        +
      </button>
    </div>
  );
}

