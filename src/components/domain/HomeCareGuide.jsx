import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { trackAnalytics } from '../../lib/analytics';

const TIPS = [
  ['Чистая ваза и прохладная вода', 'Вымойте вазу, налейте свежую прохладную воду и уберите листья, которые окажутся ниже уровня воды.'],
  ['Обновить срез', 'Подрежьте стебли чистым острым инструментом перед тем, как поставить букет в воду.'],
  ['Подальше от тепла и фруктов', 'Не ставьте букет рядом с батареей, прямым солнцем и созревающими фруктами.'],
];

export function HomeCareGuide() {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ marginTop: 30, padding: 20, borderRadius: 24, background: 'linear-gradient(135deg, rgba(255,224,234,0.82), rgba(255,246,249,0.96))', border: '1px solid rgba(161,50,85,0.14)' }}>
      <p style={{ margin: 0, color: 'var(--accent)', fontSize: 12, fontWeight: 1000, letterSpacing: '0.07em', textTransform: 'uppercase' }}>После вручения</p>
      <h2 style={{ margin: '7px 0 0', fontSize: 25, lineHeight: 1.05 }}>Как продлить жизнь букету</h2>
      <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 14, lineHeight: 1.4 }}>Три простых шага без сложных средств.</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => { const next = !value; trackAnalytics('filter_change', { meta: { filter: 'care_guide', value: next ? 'open' : 'closed' } }); return next; })} style={{ width: '100%', minHeight: 46, marginTop: 15, padding: '0 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 950, cursor: 'pointer' }}>
        {open ? 'Скрыть советы' : 'Показать советы'} <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
      </button>
      {open ? <ol style={{ margin: '16px 0 0', paddingLeft: 20, display: 'grid', gap: 13 }}>{TIPS.map(([title, text]) => <li key={title} style={{ paddingLeft: 4 }}><strong>{title}</strong><div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 13, lineHeight: 1.4 }}>{text}</div></li>)}</ol> : null}
    </section>
  );
}
