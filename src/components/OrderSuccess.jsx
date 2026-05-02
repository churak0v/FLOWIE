import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CURRENT_USER, PRODUCTS } from '../data/mock';
import { useAppState } from '../state/AppState';
import { OrderSummaryCard } from './domain/OrderSummaryCard';
import { QuickActions } from './domain/QuickActions';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { StarsRating } from './ui/StarsRating';
import { Text } from './ui/Text';

export const OrderSuccess = () => {
  const navigate = useNavigate();
  const { cart, recipients } = useAppState();
  const [rating, setRating] = useState(5);

  const last = cart[cart.length - 1];
  const product = useMemo(() => PRODUCTS.find((p) => p.id === last?.productId) || PRODUCTS[0], [last?.productId]);
  const recipient = useMemo(
    () => recipients.find((r) => r.id === last?.recipientId) || recipients[0] || null,
    [last?.recipientId, recipients]
  );

  return (
    <AppShell style={{ padding: '10px 10px calc(var(--sp-8) + var(--app-inset-bottom)) 10px' }}>
      <Surface variant="flat" style={{ padding: '20px 0 30px 0', textAlign: 'center', marginTop: 60 }}>
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 'var(--r-pill)',
            background: 'var(--c-success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '20px auto 0',
          }}
        >
          <Check size={24} color="var(--c-white)" strokeWidth={4} />
        </div>

        <div style={{ marginTop: 16 }}>
          <Text as="div" variant="title">
            Собрали и доставили
            <br />
            за 45 минут
          </Text>
        </div>

        <div style={{ marginTop: 24 }}>
          <QuickActions
            onTip={() => alert('Чаевые (демо)')}
            onContact={() => alert('Связаться (демо)')}
            onRepeat={() => navigate('/')}
          />
        </div>
      </Surface>

      <div style={{ marginTop: 10 }}>
        {recipient ? <OrderSummaryCard recipient={recipient} product={product} address={CURRENT_USER.address} /> : null}
      </div>

      <div style={{ marginTop: 18, padding: 10 }}>
        <Text variant="title" style={{ marginBottom: 16 }}>
          Оцените букет и доставку
        </Text>
        <StarsRating value={rating} onChange={setRating} />
      </div>

      <Surface
        variant="flat"
        style={{
          marginTop: 20,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text variant="caption">Итого</Text>
        <div style={{ fontSize: 24, fontWeight: 900 }}>{product.price} ₽</div>

        <button
          type="button"
          onClick={() => alert('Чеки заказа (демо)')}
          style={{
            marginTop: 16,
            width: '100%',
            height: 50,
            border: 0,
            borderRadius: 'var(--r-xl)',
            background: 'var(--c-surface-2)',
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          Чеки заказа
        </button>
      </Surface>
    </AppShell>
  );
};
