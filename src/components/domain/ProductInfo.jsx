import React from 'react';
import { Check, Gift, ShieldCheck, Truck } from 'lucide-react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { formatMoney } from '../../lib/money';
import { cleanProductSubtitle } from '../../lib/productCopy';

function DetailPill({ children, tone = 'default' }) {
  return (
    <span
      style={{
        minHeight: 32,
        padding: '0 11px',
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        background: tone === 'accent' ? 'var(--c-accent-10)' : 'var(--surface-2)',
        border: tone === 'accent' ? '1px solid var(--c-accent-border)' : '1px solid var(--border)',
        color: tone === 'accent' ? 'var(--accent)' : 'var(--text)',
        fontSize: 13,
        fontWeight: 900,
      }}
    >
      {children}
    </span>
  );
}

function TrustRow({ icon: Icon, title, text }) {
  return (
    <Surface
      variant="soft"
      style={{
        padding: 12,
        borderRadius: 16,
        border: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: '34px minmax(0, 1fr)',
        gap: 10,
        alignItems: 'center',
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          background: 'var(--c-white)',
          color: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 0 0 1px var(--c-accent-border)',
        }}
      >
        <Icon size={17} />
      </span>
      <span style={{ minWidth: 0 }}>
        <Text variant="subtitle">{title}</Text>
        <Text variant="caption" muted style={{ marginTop: 3 }}>
          {text}
        </Text>
      </span>
    </Surface>
  );
}

export function ProductInfo({ product }) {
  const included = Array.isArray(product.composition) ? product.composition.filter(Boolean).slice(0, 5) : [];
  const subtitle = cleanProductSubtitle(product.subtitle);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Surface
        variant="default"
        style={{
          padding: 16,
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          boxShadow: '0 18px 46px rgba(13,13,13,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <Text variant="title" style={{ lineHeight: 1.12 }}>
              {product.title}
            </Text>
            {subtitle ? (
              <Text variant="body" muted style={{ marginTop: 7 }}>
                {subtitle}
              </Text>
            ) : null}
          </div>

          <div
            style={{
              height: 40,
              padding: '0 13px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--c-white)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 1000,
              fontSize: 17,
              boxShadow: 'var(--shadow-accent)',
              flexShrink: 0,
            }}
          >
            {formatMoney(product.price)}
          </div>
        </div>

        {product.description ? (
          <Text variant="body" muted style={{ marginTop: 14, lineHeight: 1.45 }}>
            {product.description}
          </Text>
        ) : null}

        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DetailPill tone="accent">
            <ShieldCheck size={15} />
            Verified wishlist gift
          </DetailPill>
          <DetailPill>
            <Truck size={15} />
            Recipient confirms delivery
          </DetailPill>
          {product.size ? <DetailPill>Size {product.size}</DetailPill> : null}
        </div>
      </Surface>

      {included.length ? (
        <Surface variant="default" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Gift size={19} color="var(--accent)" />
            <Text variant="title">What is included</Text>
          </div>

          <div style={{ marginTop: 13, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {included.map((item) => (
              <DetailPill key={item}>
                <Check size={14} />
                {item}
              </DetailPill>
            ))}
          </div>
        </Surface>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        <TrustRow
          icon={ShieldCheck}
          title="No blind transfer"
          text="You buy a real product through checkout, not a vague cash request."
        />
        <TrustRow
          icon={Truck}
          title="Safe delivery"
          text="The recipient chooses a convenient time and place after payment."
        />
      </div>
    </div>
  );
}
