import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { selectProductRecommendations } from '../../lib/productRecommendations';
import { formatMoney } from '../../lib/money';
import { trackAnalytics } from '../../lib/analytics';
import { Carousel } from '../ui/Carousel';
import { AppImage } from '../ui/AppImage';
import { QuantityStepper } from '../ui/QuantityStepper';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { ProductCard } from './ProductCard';

function RecommendationSection({ title, sectionKey, products, navigate, addToCart }) {
  if (!products.length) return null;
  return (
    <section data-analytics-section={sectionKey} data-analytics-placement="product_recommendations" style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>{title}</Text>
      <Carousel>
        {products.map((product) => (
          <div key={product.id} style={{ width: 188, flexShrink: 0 }}>
            <ProductCard
              id={product.id}
              title={product.title}
              subtitle={product.subtitle}
              price={product.price}
              image={product.image}
              images={product.images}
              onOpen={() => navigate(`/product/${product.id}`)}
              onAdd={() => addToCart(product.id, 1)}
            />
          </div>
        ))}
      </Carousel>
    </section>
  );
}

function UpsellSection({ items, qtyById, setUpsellQty }) {
  const upsells = (items || []).filter((item) => item?.isActive !== false).slice(0, 6);
  if (!upsells.length) return null;
  const changeQty = (item, next) => {
    const id = item.id;
    const current = Number(qtyById?.[String(id)] || 0);
    const quantity = Math.max(0, Math.min(99, next));
    if (quantity > current) trackAnalytics('cart_add', { productId: id, meta: { quantity: quantity - current } });
    if (quantity < current) trackAnalytics('cart_remove', { productId: id, meta: { quantity: current - quantity } });
    setUpsellQty(id, quantity);
  };

  return (
    <section data-analytics-section="upsells" style={{ marginTop: 'var(--sp-8)' }}>
      <Text variant="title" style={{ marginBottom: 'var(--sp-4)' }}>Добавьте к букету</Text>
      <Carousel>
        {upsells.map((item) => {
          const key = String(item.id);
          const qty = Number(qtyById?.[key] || 0);
          return (
            <Surface key={key} variant="soft" style={{ width: 172, flex: '0 0 172px', minWidth: 0, padding: 0, overflow: 'hidden', borderRadius: 18, border: qty ? '2px solid var(--accent)' : '1px solid var(--border)' }}>
              <AppImage src={item.image || item.images?.[0]} alt={item.title} loading="lazy" variant="card"
                style={{ display: 'block', width: '100%', height: 132, objectFit: 'cover', background: 'var(--surface-2)' }} />
              <div style={{ padding: 12 }}>
                <Text variant="subtitle" style={{ minHeight: '2.32em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.16 }}>{item.title}</Text>
                <Text variant="body" muted style={{ marginTop: 6 }}>{Number(item.price) > 0 ? formatMoney(item.price) : 'Бесплатно'}</Text>
                <div style={{ marginTop: 12 }}>
                  <QuantityStepper value={qty} min={0} max={99}
                    onDec={() => changeQty(item, qty - 1)} onInc={() => changeQty(item, qty + 1)} />
                </div>
              </div>
            </Surface>
          );
        })}
      </Carousel>
    </section>
  );
}

export function ProductRecommendations({ product }) {
  const navigate = useNavigate();
  const { state, actions } = useAppState();
  const recommendations = useMemo(() => selectProductRecommendations({
    products: state.products.items,
    currentProduct: product,
  }), [product, state.products.items]);

  if (!product) return null;
  return (
    <>
      <RecommendationSection title="Похожее настроение" sectionKey="similar" products={recommendations.similar}
        navigate={navigate} addToCart={actions.addToCart} />
      <RecommendationSection title="С этими цветами" sectionKey="same_flowers" products={recommendations.sameFlowers}
        navigate={navigate} addToCart={actions.addToCart} />
      <UpsellSection items={state.upsells.items} qtyById={state.cart.upsells} setUpsellQty={actions.setUpsellQty} />
    </>
  );
}

