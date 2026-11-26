import { Text } from '../ui/Text';
import { FrequentlyOrderedSection } from './FrequentlyOrderedSection';

export function PremiumPairOffers({ pairs, focused = false, loading = false }) {
  if (!pairs.length) return focused ? <section data-analytics-section="home_offer" style={{ marginBottom: 24 }}><Text variant="title">Комплекты с минибукетом</Text><Text variant="caption" muted style={{ marginTop: 5 }}>{loading ? 'Загружаем комплекты…' : 'Этот комплект сейчас недоступен. Ниже можно выбрать другие цветы.'}</Text></section> : null;
  return <section data-analytics-section="home_offer" style={{ marginBottom: 30 }}>
    <Text variant="title">Минибукет — наш подарок</Text>
    <Text variant="caption" muted style={{ marginTop: 5, marginBottom: 14 }}>Большой и маленький в одной палитре · один адрес</Text>
    <FrequentlyOrderedSection products={pairs.map(pair => ({ ...pair.product, title: pair.code === 'angel-duet' ? 'Angel + минибукет' : 'Красный дуэт + минибукет' }))} />
  </section>;
}
