import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { Grid } from '../layout/Grid';
import { ProductCard } from './ProductCard';

export function FrequentlyOrderedSection({ products }) {
  const navigate = useNavigate();
  const { actions } = useAppState();

  return (
    <Grid>
      {(products || []).map((p) => (
        <ProductCard
          key={p.id}
          id={p.id}
          title={p.title}
          subtitle={p.subtitle}
          price={p.price}
          image={p.image}
          onOpen={() => navigate(`/product/${p.id}`)}
          onAdd={() => actions.addToCart(p.id, 1)}
        />
      ))}
    </Grid>
  );
}
