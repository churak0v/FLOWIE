import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { selectProductRecommendations } from '../../lib/productRecommendations';
import { formatMoney } from '../../lib/money';
import { trackAnalytics } from '../../lib/analytics';
import { Carousel } from '../ui/Carousel';
import { AppImage } from '../ui/AppImage';
import { Minus, Plus } from 'lucide-react';
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

function UpsellSection({ items, qtyById, setUpsellQty, enabled }) {
  const upsells = (items || []).filter((item) => item?.isActive !== false).slice(0, 6);
  if (!upsells.length) return null;
  const changeQty = (item, next) => {
    if (!enabled) return;
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
      <p style={{fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, minHeight: '2.8em', margin: '0 0 12px'}}>Дополните букет сладким подарком.<br />{enabled ? 'Добавим к вашему заказу.' : 'Сначала добавьте букет в корзину.'}</p>
      <Carousel>
        {upsells.map((item) => {
          const key = String(item.id);
          const qty = Number(qtyById?.[key] || 0);
          return (
            <Surface key={key} variant="soft" style={{ display: 'flex', flexDirection: 'column', height: 302, background: 'var(--surface)', boxShadow: 'none', width: 188, flex: '0 0 188px', minWidth: 0, padding: 0, overflow: 'hidden', borderRadius: 22, border: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', height: 186, flex: '0 0 186px', overflow: 'hidden' }}>
              <AppImage src={item.image || item.images?.[0]} alt={item.title} loading="lazy" variant="card"
                style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', objectFit: 'cover', background: 'var(--surface-2)' }} />
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <Text variant="subtitle" style={{ height: '2.32em', flexShrink: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.16 }}>{item.title}</Text>
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 1000, fontSize: 15, whiteSpace: 'nowrap' }}>{Number(item.price) > 0 ? formatMoney(item.price) : 'Бесплатно'}</span>
                  {qty > 0 ? <div style={{ marginLeft: 'auto', height: 36, borderRadius: 12, background: 'var(--c-accent)', color: 'var(--c-accent-contrast)', display: 'inline-flex', alignItems: 'center', boxShadow: 'var(--shadow-accent)', overflow: 'hidden', flexShrink: 0 }}>
                    <button type="button" disabled={!enabled} aria-label={qty === 1 ? 'Убрать дополнение' : 'Уменьшить количество дополнения'} onClick={() => changeQty(item, qty - 1)} style={{ width: 28, height: 36, border: 0, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Minus size={17} strokeWidth={3} /></button>
                    <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 1000, fontSize: 13 }}>{qty}</span>
                    <button type="button" disabled={!enabled || qty >= 99} aria-label="Увеличить количество дополнения" onClick={() => changeQty(item, qty + 1)} style={{ width: 28, height: 36, border: 0, background: 'transparent', color: 'inherit', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Plus size={17} strokeWidth={3} /></button>
                  </div> : <button type="button" disabled={!enabled} data-analytics-element="upsell_add" aria-label={`Добавить ${item.title}`} onClick={() => changeQty(item, 1)} style={{ width: 36, height: 36, borderRadius: 12, border: 0, background: 'var(--c-accent)', color: 'var(--c-accent-contrast)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: enabled ? 'pointer' : 'default', flexShrink: 0, marginLeft: 'auto', boxShadow: 'var(--shadow-accent)', opacity: enabled ? 1 : 0.5 }}><Plus size={20} strokeWidth={3} /></button>}
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
    </>
  );
}


export function ProductAdditions() {
  const { state, actions } = useAppState();
  return <UpsellSection enabled={state.cart.items.some(item => item.qty > 0)} items={state.upsells.items} qtyById={state.cart.upsells} setUpsellQty={actions.setUpsellQty} />;
}
