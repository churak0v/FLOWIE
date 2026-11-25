import { Text } from '../ui/Text';
import { splitHomeSectionProducts } from '../../lib/homeFeed';
import { FrequentlyOrderedSection } from './FrequentlyOrderedSection';
import { MoreProductsCard } from './MoreProductsCard';

export function HomeFeedSection({ title, subtitle, products, href = '/catalog', marginTop = 30 }) {
  if (!products?.length) return null;
  const { visibleProducts, collageProducts } = splitHomeSectionProducts(products);
  return (
    <section style={{ marginTop }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <Text variant="title">{title}</Text>
          {subtitle ? <Text variant="caption" muted style={{ marginTop: 4 }}>{subtitle}</Text> : null}
        </div>
      </div>
      <FrequentlyOrderedSection products={visibleProducts} trailingCard={<MoreProductsCard products={collageProducts} href={href} />} />
    </section>
  );
}
