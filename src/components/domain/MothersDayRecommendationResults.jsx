import { useNavigate } from 'react-router-dom';
import { trackAnalytics } from '../../lib/analytics';
import { recommendationReasonLabel } from '../../lib/mothersDayRecommendations';
import { useAppState } from '../../state/AppState';
import { Grid } from '../layout/Grid';
import { ProductCard } from './ProductCard';

export function MothersDayRecommendationResults({ recommendation, source }) {
  const navigate = useNavigate();
  const { actions } = useAppState();
  const pickerEvent = (event, productId) => trackAnalytics(event, { productId, meta: { source } }, { firstPartyOnly: true });

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {recommendation.groups.map((group) => (
        <section key={group.id} aria-labelledby={`picker-tier-${group.id}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <h2 id={`picker-tier-${group.id}`} style={{ margin: 0, fontSize: 20 }}>{group.label}</h2>
            <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 850 }}>{group.items.length ? `${group.items.length} варианта` : 'пока нет вариантов'}</span>
          </div>
          {group.items.length ? (
            <Grid>
              {group.items.map(({ product, reasonCode }) => (
                <div key={product.id} style={{ minWidth: 0 }}>
                  <div style={{ minHeight: 30, padding: '6px 9px', borderRadius: '10px 10px 0 0', background: 'var(--c-accent-10)', color: 'var(--accent)', fontSize: 11, fontWeight: 900, lineHeight: 1.2 }}>
                    {recommendationReasonLabel(reasonCode)}
                  </div>
                  <ProductCard
                    {...product}
                    title={product.title}
                    onOpen={() => {
                      pickerEvent('gift_picker_product_open', product.id);
                      navigate(`/product/${product.id}`, { state: { fromGiftPicker: true } });
                    }}
                    onAdd={() => {
                      pickerEvent('gift_picker_cart_add', product.id);
                      actions.addToCart(product.id, 1);
                    }}
                  />
                </div>
              ))}
            </Grid>
          ) : (
            <div style={{ padding: '16px 14px', border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--muted)', fontSize: 14 }}>Сейчас в этой цене нет подходящих букетов.</div>
          )}
        </section>
      ))}
    </div>
  );
}
