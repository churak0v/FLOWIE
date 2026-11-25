import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Droplets, Flower2, Ruler, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { FrequentlyOrderedSection } from './domain/FrequentlyOrderedSection';
import { AppImage } from './ui/AppImage';
import { useAppState } from '../state/AppState';
import { getProductFlowers } from '../lib/catalogFilters';
import { calculateCylindricalWaterMl } from '../data/flowerCare';

const SOURCES = [
  ['RHS: подготовка срезанных цветов', 'https://www.rhs.org.uk/plants/for-places/cut-flowers-conditioning'],
  ['Chrysal: базовый уход дома', 'https://www.chrysal.com/knowledge/flower-care/what-are-the-best-cut-flower-care-tips-consumers'],
  ['Chrysal: розы', 'https://www.chrysal.com/knowledge/flower-type/rose-care-tips'],
  ['Chrysal: гортензии', 'https://www.chrysal.com/en-gb/knowledge/flower-type/hydrangea-care-tips'],
  ['Chrysal: тюльпаны', 'https://www.chrysal.com/en-us/knowledge/flower-type/tulip-care-tips'],
  ['Chrysal: герберы', 'https://www.chrysal.com/en-gb/knowledge/flower-type/gerbera-care-tips'],
  ['Chrysal: эустома', 'https://www.chrysal.com/knowledge/flower-type/lisianthus-care-tips'],
  ['Chrysal: хризантемы', 'https://www.chrysal.com/knowledge/flower-type/chrysanthemum-care-tips'],
];

const CARE = [
  {
    key: 'bouquet', label: 'Смешанный букет', title: 'Сначала посмотрите на состав', accent: '#7d3f55',
    lead: 'В смешанном букете потребности цветов могут различаться. Используйте чистую вазу, прохладную водопроводную воду и средство строго по дозировке на пакетике.',
    steps: [
      ['Подготовьте вазу', 'Вымойте её, удалите листья ниже будущей линии воды. Они не должны разлагаться в воде.'],
      ['Обновите срез', 'Чистым острым ножом или секатором срежьте не меньше 2 см, не раздавливая стебель.'],
      ['Следите, а не угадывайте', 'Проверяйте уровень воды и состояние разных цветов. Не переносите автоматически объём из инструкции для одного вида.'],
      ['Выберите место', 'Держите букет вдали от батареи, прямого солнца, сквозняка и созревающих фруктов.'],
    ],
    water: 'Количество воды зависит от вазы, состава и инструкции к средству. Ниже можно рассчитать физический объём выбранного уровня воды.',
  },
  {
    key: 'roses', label: 'Розы', title: 'Розам важен свободный водозабор', accent: '#a74461',
    lead: 'Для роз источник рекомендует обновить 2–5 см стебля и убрать листья, которые окажутся в воде.',
    steps: [['Срежьте 2–5 см', 'Используйте чистый нож или секатор. Не снимайте шипы без необходимости: повреждение стебля повышает риск загрязнения.'], ['Проверьте листья', 'В воде не должно быть нижних листьев.'], ['Поддерживайте уровень', 'Доливайте воду со средством, когда уровень снижается; дозировку берите с упаковки.']],
    water: 'Фиксированный объём для любой розы источник не задаёт. Важнее не допускать падения уровня и сохранить правильную концентрацию средства.',
  },
  {
    key: 'hydrangeas', label: 'Гортензии', title: 'Гортензия требует частой проверки воды', accent: '#5964a0',
    lead: 'Гортензии потребляют много воды: уровень нужно проверять чаще, чем у большинства цветов.',
    steps: [['Срежьте 2–5 см', 'Сделайте чистый срез. Если при увядании на конце появился одревесневший участок, источник советует удалить его полностью.'], ['Проверяйте регулярно', 'Не ждите, пока ваза заметно опустеет: доливайте воду со средством по мере расхода.'], ['Уберите от тепла', 'Избегайте сквозняка, источников тепла и прямого солнца.']],
    water: 'Нужен высокий запас воды относительно букета, но универсальных литров нет: расход зависит от числа стеблей и размера вазы.',
  },
  {
    key: 'tulips', label: 'Тюльпаны', title: 'Тюльпаны продолжают двигаться и расти', accent: '#d06b72',
    lead: 'Их естественный изгиб не всегда означает увядание. После срезки тюльпаны продолжают расти и тянуться к свету.',
    steps: [['Срежьте 2–3 см', 'Используйте чистый острый нож или ножницы.'], ['Поставьте в чистую воду', 'Добавьте средство для луковичных или универсальное — только в указанной производителем дозировке.'], ['Если стебли согнулись', 'Источник предлагает оставить тюльпаны в бумаге или плёнке примерно на час, пока они пьют воду.'], ['Найдите прохладное место', 'Уберите от солнца и сквозняка.']],
    water: 'Проверенные источники не дают одного уровня воды для всех ваз. Рассчитайте объём выбранной высоты, а уровень контролируйте визуально.',
  },
  {
    key: 'gerberas', label: 'Герберы', title: 'Для гербер особенно важна чистота воды', accent: '#c76532',
    lead: 'Стебли гербер чувствительны к загрязнению, поэтому чистая стеклянная ваза здесь важнее «народных» добавок.',
    steps: [['Срежьте 2–3 см', 'Используйте чистый нож или секатор.'], ['Для монобукета', 'Производитель указывает около 0,5 л воды с пакетиком средства, рассчитанным на 0,5 л.'], ['Для смешанного букета', 'Тот же источник предупреждает: в композиции с другими цветами воды и средства, вероятно, потребуется больше. Следуйте дозировке пакетика.'], ['Защитите от тепла', 'Уберите от прямого солнца, сквозняка и источников тепла.']],
    water: '0,5 л — конкретная рекомендация источника для одного букета гербер, не универсальная норма для смешанных композиций.',
  },
  {
    key: 'eustoma', label: 'Эустома', title: 'Эустома много пьёт и любит чистую вазу', accent: '#8262a0',
    lead: 'Эустома (лизиантус) чувствительна к загрязнению воды и требует регулярного пополнения.',
    steps: [['Срежьте 2–5 см', 'Чистым ножом или секатором.'], ['Уберите нижние листья', 'Ни один лист не должен находиться ниже линии воды.'], ['Регулярно доливайте', 'Добавляйте воду со средством в правильной пропорции.'], ['Уберите от фруктов и тепла', 'Не ставьте рядом с созревающими фруктами, батареей, на солнце или сквозняке.']],
    water: 'Источник подчёркивает высокий расход, но не задаёт универсальный объём: ориентируйтесь на фактическое снижение уровня.',
  },
  {
    key: 'chrysanthemums', label: 'Хризантемы', title: 'Хризантемам нужна стабильная чистая вода', accent: '#8c6b27',
    lead: 'Даже выносливые хризантемы хуже пьют при загрязнении воды.',
    steps: [['Срежьте 2–3 см', 'Используйте чистый острый нож или секатор.'], ['Уберите листья из воды', 'Это замедляет загрязнение и закупорку стеблей.'], ['Доливайте свежую воду', 'Используйте средство по инструкции и пополняйте воду по мере расхода.'], ['Не перегревайте', 'Держите вдали от солнца, батареи, сквозняка и созревающих фруктов.']],
    water: 'Фиксированный объём не указан. Поддерживайте уровень и чистоту воды по состоянию букета.',
  },
];

function useCareDocumentMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousCanonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    document.title = 'Как ухаживать за букетом и цветами | FLOWIE';
    let canonical = document.querySelector('link[rel="canonical"]');
    const created = !canonical;
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${window.location.origin}/care`;
    return () => { document.title = previousTitle; if (created) canonical.remove(); else canonical.setAttribute('href', previousCanonical); };
  }, []);
}

export function CareGuide() {
  useCareDocumentMeta();
  const navigate = useNavigate();
  const { state } = useAppState();
  const [selectedKey, setSelectedKey] = useState('bouquet');
  const [diameter, setDiameter] = useState('12');
  const [waterHeight, setWaterHeight] = useState('10');
  const selected = CARE.find((item) => item.key === selectedKey) || CARE[0];
  const volume = useMemo(() => calculateCylindricalWaterMl(diameter, waterHeight), [diameter, waterHeight]);
  const products = useMemo(() => {
    const items = state.products.items || [];
    if (selectedKey === 'bouquet') return items.slice(0, 4);
    return items.filter((product) => getProductFlowers(product).some((flower) => flower.key === selectedKey)).slice(0, 4);
  }, [selectedKey, state.products.items]);
  const heroImage = products[0]?.image || state.products.items.find((product) => product?.image)?.image;

  return (
    <AppShell style={{ padding: 0, background: '#fbf7f8' }}>
      <main style={{ minHeight: '100dvh', paddingBottom: 64, color: '#2b1e23' }}>
        <header style={{ position: 'relative', minHeight: 'min(72svh, 650px)', overflow: 'hidden', background: selected.accent }}>
          {heroImage ? <AppImage src={heroImage} alt="" loading="eager" fetchPriority="high" variant="hero" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(32,18,23,.18), rgba(32,18,23,.82) 82%)' }} />
          <button type="button" onClick={() => navigate(-1)} aria-label="Назад" style={{ position: 'absolute', zIndex: 2, top: 'calc(16px + var(--app-inset-top))', left: 'calc(16px + var(--app-inset-left))', width: 44, height: 44, borderRadius: 15, border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.82)', display: 'grid', placeItems: 'center', color: '#2b1e23', backdropFilter: 'blur(12px)' }}><ArrowLeft size={21} /></button>
          <div style={{ position: 'relative', zIndex: 1, minHeight: 'min(72svh, 650px)', padding: 'calc(100px + var(--app-inset-top)) calc(22px + var(--app-inset-right)) 34px calc(22px + var(--app-inset-left))', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', color: '#fff' }}>
            <span style={{ fontSize: 12, fontWeight: 1000, letterSpacing: '.12em', textTransform: 'uppercase' }}>FLOWIE care</span>
            <h1 style={{ margin: '12px 0 0', maxWidth: 620, fontSize: 'clamp(40px, 10vw, 72px)', lineHeight: .92, letterSpacing: '-.045em' }}>Цветы пьют по-разному</h1>
            <p style={{ margin: '18px 0 0', maxWidth: 560, fontSize: 17, lineHeight: 1.45, color: 'rgba(255,255,255,.84)' }}>Практический гид по составу букета — без обещаний срока свежести и случайных универсальных литров.</p>
          </div>
        </header>

        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '34px calc(18px + var(--app-inset-right)) 0 calc(18px + var(--app-inset-left))' }}>
          <section aria-labelledby="care-choice">
            <p style={{ margin: 0, color: selected.accent, fontSize: 12, fontWeight: 1000, letterSpacing: '.1em', textTransform: 'uppercase' }}>Что у вас в букете</p>
            <h2 id="care-choice" style={{ margin: '8px 0 18px', fontSize: 31, lineHeight: 1 }}>Выберите цветок или композицию</h2>
            <div style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '2px 0 8px', scrollbarWidth: 'none' }}>{CARE.map((item) => <button key={item.key} type="button" aria-pressed={item.key === selectedKey} onClick={() => setSelectedKey(item.key)} style={{ flexShrink: 0, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${item.key === selectedKey ? item.accent : 'rgba(43,30,35,.14)'}`, background: item.key === selectedKey ? item.accent : '#fff', color: item.key === selectedKey ? '#fff' : '#2b1e23', fontWeight: 900, cursor: 'pointer' }}>{item.label}</button>)}</div>
          </section>

          <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 14 }}>
            <div style={{ padding: 24, borderRadius: 28, background: selected.accent, color: '#fff', boxShadow: `0 20px 50px ${selected.accent}33` }}><Flower2 size={28} /><h2 style={{ margin: '22px 0 10px', fontSize: 30, lineHeight: 1 }}>{selected.title}</h2><p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,.84)' }}>{selected.lead}</p></div>
            <div style={{ padding: 24, borderRadius: 28, background: '#fff', border: '1px solid rgba(43,30,35,.08)' }}><Droplets size={28} color={selected.accent} /><p style={{ margin: '22px 0 6px', color: selected.accent, fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}>Про воду</p><p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{selected.water}</p></div>
          </section>

          <section style={{ marginTop: 38 }}><h2 style={{ margin: 0, fontSize: 31 }}>Порядок действий</h2><div style={{ marginTop: 18, display: 'grid', gap: 10 }}>{selected.steps.map(([title, text], index) => <article key={title} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr)', gap: 14, padding: 18, borderRadius: 22, background: '#fff', border: '1px solid rgba(43,30,35,.07)' }}><span style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 16, background: `${selected.accent}14`, color: selected.accent, fontSize: 17, fontWeight: 1000 }}>{index + 1}</span><div><h3 style={{ margin: 2, fontSize: 18 }}>{title}</h3><p style={{ margin: '7px 2px 0', color: '#715f66', lineHeight: 1.5 }}>{text}</p></div></article>)}</div></section>

          <section style={{ marginTop: 38, padding: 24, borderRadius: 28, background: '#efe5e8' }}>
            <Ruler size={28} color={selected.accent} /><h2 style={{ margin: '16px 0 8px', fontSize: 29 }}>Сколько воды войдёт до выбранной отметки</h2><p style={{ margin: 0, color: '#715f66', lineHeight: 1.5 }}>Это геометрический расчёт для цилиндрической вазы, а не рекомендация уровня воды.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, marginTop: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 900 }}>Диаметр внутри, см<input type="number" inputMode="decimal" min="1" max="60" value={diameter} onChange={(event) => setDiameter(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid rgba(43,30,35,.14)', background: '#fff', fontSize: 17 }} /></label>
              <label style={{ fontSize: 13, fontWeight: 900 }}>Высота воды, см<input type="number" inputMode="decimal" min="1" max="60" value={waterHeight} onChange={(event) => setWaterHeight(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid rgba(43,30,35,.14)', background: '#fff', fontSize: 17 }} /></label>
            </div>
            <div aria-live="polite" style={{ marginTop: 16, padding: 18, borderRadius: 18, background: '#fff' }}>{volume == null ? <strong>Введите размеры от 1 до 60 см</strong> : <><span style={{ display: 'block', color: '#715f66', fontSize: 13 }}>Расчёт: π × (диаметр ÷ 2)² × высота</span><strong style={{ display: 'block', marginTop: 5, fontSize: 27 }}>≈ {volume >= 1000 ? `${(volume / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л` : `${volume} мл`}</strong></>}</div>
          </section>

          {products.length ? <section style={{ marginTop: 42 }}><span style={{ color: selected.accent, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}><Sparkles size={16} /> В актуальном каталоге</span><h2 style={{ margin: '8px 0 17px', fontSize: 31 }}>{selectedKey === 'bouquet' ? 'Букеты FLOWIE' : `Букеты: ${selected.label.toLocaleLowerCase('ru-RU')}`}</h2><FrequentlyOrderedSection products={products} /></section> : null}

          <section style={{ marginTop: 42, paddingTop: 26, borderTop: '1px solid rgba(43,30,35,.12)' }}><h2 style={{ margin: 0, fontSize: 25 }}>На чём основан гид</h2><p style={{ color: '#715f66', lineHeight: 1.5 }}>Использованы рекомендации Королевского садоводческого общества и производителя средств для срезанных цветов. Дозировка средства всегда определяется его упаковкой.</p><ul style={{ margin: '16px 0 0', paddingLeft: 20, display: 'grid', gap: 9 }}>{SOURCES.map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer" style={{ color: selected.accent, fontWeight: 850 }}>{label}</a></li>)}</ul></section>
        </div>
      </main>
    </AppShell>
  );
}
