import { Link } from 'react-router-dom';
import { Text } from '../ui/Text';
import { FrequentlyOrderedSection } from './FrequentlyOrderedSection';

export function HomeFeedSection({ title, subtitle, products, href = '/catalog', marginTop = 30 }) {
  if (!products?.length) return null;
  return (
    <section style={{ marginTop }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <Text variant="title">{title}</Text>
          {subtitle ? <Text variant="caption" muted style={{ marginTop: 4 }}>{subtitle}</Text> : null}
        </div>
        <Link to={href} style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 1000, whiteSpace: 'nowrap', textUnderlineOffset: 3 }}>Смотреть все</Link>
      </div>
      <FrequentlyOrderedSection products={products} />
    </section>
  );
}
