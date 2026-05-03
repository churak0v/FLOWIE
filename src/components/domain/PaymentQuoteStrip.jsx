import React from 'react';
import { Sparkles, Wallet } from 'lucide-react';
import { usePaymentQuote } from '../../lib/paymentRates';

export function PaymentQuoteStrip({ totalUsd }) {
  const quote = usePaymentQuote(totalUsd);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}
    >
      <div
        style={{
          minWidth: 0,
          borderRadius: 'var(--r-lg)',
          border: '1px solid rgba(21,151,255,0.22)',
          background: 'linear-gradient(135deg, rgba(21,151,255,0.12), rgba(255,255,255,0.72))',
          padding: 12,
        }}
      >
        <Wallet size={18} color="#1597ff" />
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 1000, color: '#1597ff' }}>{quote.tonLabel}</div>
        <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: 'var(--muted)' }}>TON estimate</div>
      </div>

      <div
        style={{
          minWidth: 0,
          borderRadius: 'var(--r-lg)',
          border: '1px solid rgba(246,183,60,0.34)',
          background: 'linear-gradient(135deg, rgba(246,183,60,0.18), rgba(255,255,255,0.72))',
          padding: 12,
        }}
      >
        <Sparkles size={18} color="#f6b73c" />
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 1000, color: '#b98218' }}>{quote.starsLabel}</div>
        <div style={{ marginTop: 3, fontSize: 10, fontWeight: 800, color: 'var(--muted)' }}>Stars estimate</div>
      </div>
    </div>
  );
}
