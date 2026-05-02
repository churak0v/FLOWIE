import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { Carousel } from '../ui/Carousel';
import { Text } from '../ui/Text';
import { ProductCard } from './ProductCard';

export function AlsoLikeSection({ productId }) {
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const recs = useMemo(() => {
    const products = state.products.items || [];
    const base = products.find((p) => p.id === productId);
    if (!base) return products.slice(0, 6);
    return products
      .filter((p) => p.id !== productId)
      .filter((p) => (base.categoryId ? p.categoryId === base.categoryId : true))
      .sort((a, b) => Math.abs(a.price - base.price) - Math.abs(b.price - base.price))
      .slice(0, 6);
  }, [productId, state.products.items]);

  return (
    <div style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>
        Также может понравиться
      </Text>

      <Carousel>
        {recs.map((p) => (
          <div key={p.id} style={{ width: 188, flexShrink: 0 }}>
            <ProductCard
              id={p.id}
              title={p.title}
              subtitle={p.subtitle}
              price={p.price}
              image={p.image}
              onOpen={() => navigate(`/product/${p.id}`)}
              onAdd={() => actions.addToCart(p.id, 1)}
            />
          </div>
        ))}
      </Carousel>
    </div>
  );
}
