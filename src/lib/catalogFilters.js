const FLOWER_RULES = [
  { key: 'spray-roses', label: 'Кустовые розы', pattern: /кустов[а-яё]*\s+роз(?:а|ы|у|е|ой|ою|ам|ами|ах)?(?=$|[^а-яё])/ },
  { key: 'peony-roses', label: 'Пионовидные розы', pattern: /пионовидн[а-яё]*\s+роз(?:а|ы|у|е|ой|ою|ам|ами|ах)?(?=$|[^а-яё])/ },
  { key: 'roses', label: 'Розы', pattern: /(^|[^а-яё])роз(?:а|ы|у|е|ой|ою|ам|ами|ах)?(?=$|[^а-яё])/ },
  { key: 'chrysanthemums', label: 'Хризантемы', pattern: /хризантем/ },
  { key: 'peonies', label: 'Пионы', pattern: /(^|[^а-яё])пион[а-яё]*/ },
  { key: 'tulips', label: 'Тюльпаны', pattern: /тюльпан/ },
  { key: 'hydrangeas', label: 'Гортензии', pattern: /гортенз/ },
  { key: 'eustoma', label: 'Эустома', pattern: /эустом|лизиант/ },
  { key: 'alstroemeria', label: 'Альстромерии', pattern: /альстромер/ },
  { key: 'dianthus', label: 'Диантус', pattern: /диантус/ },
  { key: 'matthiola', label: 'Маттиола', pattern: /маттиол/ },
  { key: 'carnations', label: 'Гвоздики', pattern: /гвоздик/ },
  { key: 'gerberas', label: 'Герберы', pattern: /гербер/ },
  { key: 'orchids', label: 'Орхидеи', pattern: /орхиде/ },
  { key: 'lilies', label: 'Лилии', pattern: /лил(?:и|ей|ия)/ },
  { key: 'daisies', label: 'Ромашки', pattern: /ромаш/ },
  { key: 'sunflowers', label: 'Подсолнухи', pattern: /подсолн/ },
  { key: 'irises', label: 'Ирисы', pattern: /ирис/ },
  { key: 'ranunculus', label: 'Ранункулюсы', pattern: /ранункул/ },
  { key: 'anemones', label: 'Анемоны', pattern: /анемон/ },
  { key: 'freesia', label: 'Фрезии', pattern: /фрези/ },
  { key: 'dahlias', label: 'Георгины', pattern: /георгин/ },
  { key: 'lagurus', label: 'Лагурус', pattern: /лагурус/ },
  { key: 'gypsophila', label: 'Гипсофила', pattern: /гипсофил/ },
  { key: 'ozothamnus', label: 'Озотамнус', pattern: /озотамнус/ },
  { key: 'tanacetum', label: 'Танацетум', pattern: /танацетум/ },
  { key: 'cotton', label: 'Хлопок', pattern: /(^|[^а-яё])хлопок(?=$|[^а-яё])/ },
  { key: 'amaranth', label: 'Амарант', pattern: /амарант/ },
  { key: 'statice', label: 'Кермек', pattern: /кермек|статиц/ },
  { key: 'limonium', label: 'Лимониум', pattern: /лимониум/ },
  { key: 'spray-roses', label: 'Кустовые розы', pattern: /марвел\s+баблз/ },
  { key: 'seasonal', label: 'Сезонные цветы', pattern: /сезонн[а-яё]*\s+цвет/ },
];

const NON_FLOWER_RE = /упаков|лент|бант|открытк|инструкц|рекомендац[а-яё]*\s+по\s+уход|зелень|эвкалипт|нобилис|писташ|фисташк|букет|корзин|коробк|кашпо|сумочк|ваза|стекл[а-яё]*\s+ваз|аквабокс|с\s+водой|кризал|chrysal|биофлор|губк[а-яё]*(?:\s+флорист)?|оазис|средств|подкорм|удобрен|сыворот|маск|парфюм|perfume|transport|транспорт|доставк|наушник|кабел|чехол|дополн|декор|бумаг|тишью|фоамиран|пленк|плёнк|пакет|оформлен|топпер|игрушк|шпажк/;

const PRESERVED_TITLE_RE = /сухоцветн[а-яё]*\s+(?:букет|композици)|(?:букет|композици)[^|—;]{0,40}(?:из\s+)?сухоцвет|(?:^|[|—:;-])\s*стабилизированн[а-яё]*\s+(?:букет|композици|цвет)|^\s*стабилизированн[а-яё]*\s+(?:роз|гортенз|орхиде|лаванд|лагурус|хлопок|мох|эвкалипт|амарант|кермек|лимониум)|(?:букет|композици)[^|—;]{0,48}(?:из\s+)?стабилизированн[а-яё]*\s+цвет/iu;
const PRESERVED_INGREDIENT_RE = /сухоцвет|стабилиз|высуш|суш[её]н/iu;
const INHERENT_DRY_FLOWERS = new Set(['lagurus', 'cotton']);

function cleanCompositionName(value) {
  const raw = typeof value === 'object' && value ? value.name : value;
  return String(raw || '')
    .split('·')[0]
    .replace(/\b\d+\s*(?:шт\.?|вет(?:ок|ки)?|стебл(?:ей|я)?)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function normalizeFlowerName(value) {
  const name = cleanCompositionName(value);
  const normalized = name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (!normalized || NON_FLOWER_RE.test(normalized)) return null;
  const matched = FLOWER_RULES.find((rule) => rule.pattern.test(normalized));
  if (matched) return { key: matched.key, label: matched.label };
  if (name.length < 2 || name.length > 48) return null;
  return {
    key: slugify(name),
    label: `${name.charAt(0).toLocaleUpperCase('ru-RU')}${name.slice(1)}`,
  };
}

export function getProductFlowers(product) {
  const byKey = new Map();
  for (const entry of Array.isArray(product?.composition) ? product.composition : []) {
    const flower = normalizeFlowerName(entry);
    if (flower?.key && !byKey.has(flower.key)) byKey.set(flower.key, flower);
  }
  return [...byKey.values()];
}

export function isPreservedComposition(product) {
  const title = [product?.title, product?.name, product?.subtitle].map(value => String(value || '')).join(' ');
  if (PRESERVED_TITLE_RE.test(title)) return true;
  const botanical = (Array.isArray(product?.composition) ? product.composition : [])
    .map(entry => ({ entry, flower: normalizeFlowerName(entry), raw: cleanCompositionName(entry) }))
    .filter(item => item.flower);
  if (!botanical.length) return false;
  return botanical.every(({ flower, raw }) => PRESERVED_INGREDIENT_RE.test(raw) || INHERENT_DRY_FLOWERS.has(flower.key));
}

export function buildFlowerOptions(products) {
  const options = new Map();
  for (const product of products || []) {
    for (const flower of getProductFlowers(product)) {
      const existing = options.get(flower.key) || { ...flower, count: 0 };
      existing.count += 1;
      options.set(flower.key, existing);
    }
  }
  return [...options.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
}

export function normalizePriceBoundary(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

export function selectCatalogScopeProducts(products, productIds) {
  if (productIds == null) return products || [];
  const byId = new Map((products || []).map((product) => [String(product.id), product]));
  return (productIds || []).map((id) => byId.get(String(id))).filter(Boolean);
}

export function filterCatalogProducts(products, filters = {}) {
  const query = String(filters.search || '').trim().toLocaleLowerCase('ru-RU');
  const selectedFlowers = new Set(filters.flowers || []);
  const semanticProductIds = new Set((filters.semanticProductIds || []).map(String));
  const min = normalizePriceBoundary(filters.min);
  const max = normalizePriceBoundary(filters.max);

  const filtered = (products || []).filter((product) => {
    const price = Number(product?.price || 0);
    if (min != null && price < min) return false;
    if (max != null && price > max) return false;

    const productFlowers = getProductFlowers(product);
    if (selectedFlowers.size && !productFlowers.some((flower) => selectedFlowers.has(flower.key))) return false;
    if (!query) return true;

    const haystack = [
      product?.title,
      product?.subtitle,
      product?.description,
      ...productFlowers.map((flower) => flower.label),
    ].map((value) => String(value || '').toLocaleLowerCase('ru-RU')).join(' ');
    return haystack.includes(query) || semanticProductIds.has(String(product?.id));
  });

  if (filters.sort === 'price_asc') return filtered.map((product, index) => ({ product, index })).sort((a, b) => Number(a.product.price || 0) - Number(b.product.price || 0) || a.index - b.index).map(({ product }) => product);
  if (filters.sort === 'price_desc') return filtered.map((product, index) => ({ product, index })).sort((a, b) => Number(b.product.price || 0) - Number(a.product.price || 0) || a.index - b.index).map(({ product }) => product);
  return filtered;
}

export const PRICE_PRESETS = [
  { key: 'under-3000', label: 'До 3 000 ₽', min: null, max: 3000 },
  { key: '3000-5000', label: '3 000–5 000 ₽', min: 3000, max: 5000 },
  { key: '5000-7000', label: '5 000–7 000 ₽', min: 5000, max: 7000 },
  { key: 'from-7000', label: 'От 7 000 ₽', min: 7000, max: null },
];
