import React from 'react';
import { Check, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { usePaymentQuote } from '../../lib/paymentRates';

const METHODS = [
  {
    id: 'ton',
    title: 'TON Connect',
    subtitle: 'Pay from your TON wallet',
    badge: 'Wallet',
    icon: Wallet,
    color: '#1597ff',
    bg: 'linear-gradient(135deg, rgba(21,151,255,0.14), rgba(21,151,255,0.04))',
  },
  {
    id: 'stars',
    title: 'Telegram Stars',
    subtitle: 'Fast in-app payment',
    badge: 'Stars',
    icon: Sparkles,
    color: '#f6b73c',
    bg: 'linear-gradient(135deg, rgba(246,183,60,0.20), rgba(246,183,60,0.05))',
  },
];

function MethodCard({ method, selected, onClick, amountLabel, rateLabel }) {
  const Icon = method.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        border: selected ? `2px solid ${method.color}` : '1px solid var(--border)',
        background: method.bg,
        borderRadius: 'var(--r-lg)',
        padding: 14,
        cursor: 'pointer',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        boxShadow: selected ? `0 12px 28px ${method.color}22` : 'none',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: method.color,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={22} strokeWidth={2.4} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {method.title}
          </Text>
          <span
            style={{
              height: 22,
              padding: '0 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.72)',
              color: method.color,
              fontSize: 11,
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {method.badge}
          </span>
        </div>
        <div style={{ marginTop: 4 }}>
          <Text variant="body" muted style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
            {method.subtitle}
          </Text>
        </div>
        {amountLabel ? (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.78)',
                color: method.color,
                fontSize: 13,
                fontWeight: 1000,
                display: 'inline-flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {amountLabel}
            </span>
            {rateLabel ? (
              <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {rateLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: selected ? `0` : '1px solid var(--border)',
          background: selected ? method.color : 'rgba(255,255,255,0.72)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {selected ? <Check size={16} strokeWidth={3} /> : null}
      </div>
    </button>
  );
}

export function PaymentMethods({ value, onChange, totalUsd = 0 }) {
  const quote = usePaymentQuote(totalUsd);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <Text variant="title">Payment</Text>
        <span
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 999,
            background: 'var(--c-accent-10)',
            color: 'var(--accent)',
            fontSize: 12,
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}
        >
          <ShieldCheck size={14} />
          Safe checkout
        </span>
      </div>

      <Surface variant="soft" style={{ padding: 10, borderRadius: 'var(--r-lg)', display: 'grid', gap: 10 }}>
        {METHODS.map((method) => (
          <MethodCard
            key={method.id}
            method={method}
            selected={value === method.id}
            onClick={() => onChange?.(method.id)}
            amountLabel={method.id === 'ton' ? quote.tonLabel : quote.starsLabel}
            rateLabel={method.id === 'ton' ? quote.rateLabel : '~64 Stars / $1'}
          />
        ))}
      </Surface>
    </div>
  );
}
