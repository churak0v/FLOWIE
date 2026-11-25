import {
  MOTHERS_DAY_PRICE_TIERS,
  selectMothersDayProducts,
} from './mothersDayCampaign.js';

const TOKEN_TERMS = {
  cream: ['крем', 'беж', 'айвори', 'молоч', 'шампань'],
  blush: ['пудр', 'персик', 'нежно-роз', 'пастел'],
  pink: ['розов', 'фукси'],
  red: ['красн', 'алый', 'бордов'],
  berry: ['ягод', 'винн', 'бордов', 'малинов'],
  orange: ['оранж', 'персик', 'терракот'],
  yellow: ['желт', 'жёлт', 'лимон', 'солнеч'],
  green: ['зелен', 'зелён', 'эвкалипт'],
  blue: ['син', 'голуб'],
  lilac: ['сирен', 'лилов', 'фиолет', 'лаванд'],
  white: ['бел', 'молоч', 'айвори'],
};

const STYLE_TERMS = {
  soft: ['нежн', 'пудр', 'пастел', 'воздуш'],
  bright: ['ярк', 'контраст', 'сочн'],
  light: ['светл', 'бел', 'молоч', 'воздуш'],
  rich: ['насыщ', 'бордов', 'винн', 'авторск'],
};

function productText(product) {
  const tags = Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags;
  return [product?.title, product?.description, product?.color, tags]
    .map((value) => String(value || '').toLocaleLowerCase('ru-RU'))
    .join(' ');
}

function firstMatchingToken(product, palette = []) {
  const text = productText(product);
  return palette.find((token) => (TOKEN_TERMS[token] || []).some((term) => text.includes(term))) || null;
}

export function normalizeGiftPickerSegment(value) {
  const token = String(value || '').trim().toLowerCase();
  return ['value', 'premium', 'balanced'].includes(token) ? token : 'balanced';
}

function scoreProduct(product, profile, styleCode, campaignIndex, campaignSegment, tier) {
  const text = productText(product);
  let score = Math.max(0, 30 - campaignIndex);
  for (const [index, token] of (profile?.palette || []).entries()) {
    if ((TOKEN_TERMS[token] || []).some((term) => text.includes(term))) score += 18 - (index * 4);
  }
  if ((STYLE_TERMS[styleCode] || []).some((term) => text.includes(term))) score += 9;
  if (profile?.tone === 'soft' && STYLE_TERMS.soft.some((term) => text.includes(term))) score += 5;
  if (profile?.tone === 'vivid' && STYLE_TERMS.bright.some((term) => text.includes(term))) score += 5;
  if (profile?.lightness === 'light' && STYLE_TERMS.light.some((term) => text.includes(term))) score += 4;
  const price = Number(product?.price || 0);
  if (campaignSegment === 'value') score += Math.max(0, (Number.isFinite(tier.max) ? tier.max : price) - price) / 1_000;
  if (campaignSegment === 'premium') score += Math.max(0, price - tier.min) / 1_000;
  return score;
}

function reasonFor(product, profile, styleCode) {
  const token = firstMatchingToken(product, profile?.palette);
  if (token) return `palette:${token}`;
  if (styleCode && (STYLE_TERMS[styleCode] || []).some((term) => productText(product).includes(term))) return `style:${styleCode}`;
  return 'campaign-choice';
}

export function recommendMothersDayProducts({ products, collections, profile = null, styleCode = 'soft', campaignSegment = 'balanced', limit = 6 } = {}) {
  const segment = normalizeGiftPickerSegment(campaignSegment);
  const source = selectMothersDayProducts(products, collections, '', Math.max(20, (products || []).length));
  const campaignOrder = new Map(source.map((product, index) => [String(product.id), index]));
  const seen = new Set();
  const groups = MOTHERS_DAY_PRICE_TIERS.map((tier) => {
    const ranked = source
      .filter((product) => Number(product?.price) >= tier.min && Number(product?.price) <= tier.max)
      .map((product) => ({
        product,
        score: scoreProduct(product, profile, styleCode, campaignOrder.get(String(product.id)) || 0, segment, tier),
        reasonCode: reasonFor(product, profile, styleCode),
      }))
      .sort((left, right) => right.score - left.score
        || Number(left.product?.sort || 0) - Number(right.product?.sort || 0)
        || Number(left.product?.id || 0) - Number(right.product?.id || 0));
    const items = [];
    for (const item of ranked) {
      if (seen.has(String(item.product.id))) continue;
      seen.add(String(item.product.id));
      items.push(item);
      if (items.length >= 2 || seen.size >= limit) break;
    }
    return { ...tier, items };
  });
  const resultCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  return {
    mode: profile ? 'photo' : styleCode ? 'manual' : 'fallback',
    campaignSegment: segment,
    groups,
    resultCount,
    tierCoverage: groups.filter((group) => group.items.length > 0).length,
  };
}

export function recommendationReasonLabel(reasonCode) {
  const paletteLabels = {
    cream: 'Поддерживает кремовую гамму', blush: 'Поддерживает пудровую гамму', pink: 'Розовый акцент',
    red: 'Красный акцент', berry: 'Глубокая ягодная гамма', orange: 'Тёплый акцент', yellow: 'Солнечный акцент',
    green: 'Природная зелёная гамма', blue: 'Прохладная гамма', lilac: 'Сиреневый акцент', white: 'Светлая гамма',
  };
  if (String(reasonCode).startsWith('palette:')) return paletteLabels[String(reasonCode).split(':')[1]] || 'Сочетается с палитрой';
  if (String(reasonCode).startsWith('style:')) return 'Подходит к выбранному стилю';
  return 'Выбор FLOWIE ко Дню матери';
}
