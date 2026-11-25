import { MapPin, Ruler, ReceiptText } from 'lucide-react';

const ITEMS = [
  { icon: MapPin, title: 'Не знаете адрес?', text: 'Уточним его у получателя. Доставку рассчитаем отдельно.', background: '#f6e8ef' },
  { icon: Ruler, title: 'Размер без догадок', text: 'Показываем диаметр и высоту, когда они указаны для букета.', background: '#edf2df' },
  { icon: ReceiptText, title: 'Честная стоимость', text: 'До оплаты видно, включена доставка или будет отдельным счётом.', background: '#eee9fb' },
];

export function CampaignAssuranceCards() {
  return (
    <section aria-label="Как оформить доставку" style={{ padding: '18px calc(16px + var(--app-inset-right)) 0 calc(16px + var(--app-inset-left))' }}>
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4 }}>
        {ITEMS.map(({ icon: Icon, title, text, background }) => (
          <article key={title} style={{ minWidth: 'min(78vw, 286px)', minHeight: 142, padding: 16, borderRadius: 22, background, scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <span style={{ width: 38, height: 38, borderRadius: 13, background: 'rgba(255,255,255,0.72)', display: 'grid', placeItems: 'center', color: 'var(--text)' }}><Icon size={20} strokeWidth={2.5} /></span>
            <div style={{ marginTop: 18 }}>
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{title}</h2>
              <p style={{ margin: '7px 0 0', color: 'var(--c-ink-72)', fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
