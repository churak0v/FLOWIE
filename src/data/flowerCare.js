import { getProductFlowers, isPreservedComposition } from '../lib/catalogFilters.js';

export { isPreservedComposition } from '../lib/catalogFilters.js';

export const FLOWER_CARE_SOURCES = [
  ['RHS: уход за срезанными цветами', 'https://www.rhs.org.uk/plants/for-places/cut-flowers-conditioning'],
  ['Chrysal: уход за букетом дома', 'https://www.chrysal.com/knowledge/flower-care/what-are-the-best-cut-flower-care-tips-consumers'],
  ['Chrysal: розы', 'https://www.chrysal.com/knowledge/flower-type/rose-care-tips'],
  ['Chrysal: гортензии', 'https://www.chrysal.com/en-gb/knowledge/flower-type/hydrangea-care-tips'],
  ['Chrysal: тюльпаны', 'https://www.chrysal.com/en-us/knowledge/flower-type/tulip-care-tips'],
  ['Chrysal: герберы', 'https://www.chrysal.com/en-gb/knowledge/flower-type/gerbera-care-tips'],
  ['Chrysal: эустома', 'https://www.chrysal.com/knowledge/flower-type/lisianthus-care-tips'],
  ['Chrysal: хризантемы', 'https://www.chrysal.com/knowledge/flower-type/chrysanthemum-care-tips'],
  ['OASIS: флористическая губка', 'https://www.oasisfloralproducts.com/blogs/ideas/5-tips-for-choosing-the-best-floral-foam'],
  ['Florever: уход за стабилизированными цветами', 'https://www.florever.com/catalog2025-2026/pageindices/index55.html'],
  ['Verdissimo: уход за стабилизированными растениями', 'https://www.verdissimo.com/wp-content/themes/coolstuff-child-2018/pdf/flores-preservadas-y-verdes-catalogo-general-2019.pdf'],
];

const GENERAL = {
  key: 'bouquet', label: 'Смешанный букет', title: 'Уход за смешанным букетом', accent: '#7d3f55',
  lead: 'Чистая ваза, свежий срез и прохладное место помогут каждому цветку получать воду.',
  steps: [['Подготовьте вазу', 'Вымойте её и уберите листья, которые окажутся ниже воды.'], ['Обновите срез', 'Чистым острым ножом или секатором срежьте не меньше 2 см, не сдавливая стебли.'], ['Проверяйте воду', 'Доливайте свежую воду, а средство для цветов разводите точно по инструкции на пакетике.'], ['Выберите место', 'Поставьте букет вдали от батареи, прямого солнца, сквозняка и созревающих фруктов.']],
  water: 'Налейте столько воды, чтобы нижние листья оставались над ней. Если вода опустилась примерно до трети высоты вазы, долейте свежую воду со средством в той же пропорции.',
};

const FOAM = {
  key: 'composition', label: 'Композиция в губке', title: 'Уход за композицией во флористической губке', accent: '#48786c',
  lead: 'Цветы получают воду из влажной губки внутри коробки или корзины. Поддерживайте её влажной, не разбирая композицию.',
  steps: [['Проверяйте каждый день', 'Осторожно коснитесь открытого края губки. Если он начинает подсыхать, композиции нужна вода.'], ['Поливайте вниз', 'Медленно лейте воду небольшими порциями прямо в открытую часть губки, между стеблями.'], ['Берегите декор', 'Не лейте на бутоны, листья, ленты и упаковку. Остановитесь, если вода перестала впитываться или появилась в поддоне.'], ['Защитите поверхность', 'Поставьте композицию на влагостойкую подставку или поднос, вдали от солнца, батареи и сквозняка.']],
  water: 'Доливайте небольшими порциями, пока губка впитывает воду без луж и перелива. Не пытайтесь залить весь контейнер.',
};

const PRESERVED = {
  key: 'preserved', label: 'Стабилизированные', title: 'Уход за стабилизированными цветами и сухоцветами', accent: '#8b6f5d',
  lead: 'Этой композиции не нужна вода. Ей подойдёт сухое место в комнате, где нет прямого солнца и сильного тепла.',
  steps: [['Не поливайте', 'Не наливайте воду в вазу или контейнер и не опрыскивайте цветы.'], ['Берегите от влажности', 'Не ставьте композицию в ванной, у увлажнителя или там, где на неё может попасть вода.'], ['Уберите от солнца и отопления', 'Прямые лучи и близость батареи могут повлиять на цвет и сделать лепестки более хрупкими.'], ['Снимайте пыль насухо', 'Используйте мягкую сухую кисть или очень слабый поток прохладного воздуха. Не протирайте влажной салфеткой.']],
  water: 'Вода не нужна — держите композицию сухой и защищённой от брызг.',
};

export const FLOWER_CARE_OPTIONS = [
  GENERAL,
  FOAM,
  PRESERVED,
  { key: 'roses', label: 'Розы', title: 'Уход за розами', accent: '#a74461', lead: 'Розам особенно важны чистая вода и свободный срез стебля.', steps: [['Срежьте 2–5 см', 'Используйте чистый нож или секатор; не снимайте шипы без необходимости.'], ['Уберите нижние листья', 'Листья не должны касаться воды.'], ['Поддерживайте уровень', 'Доливайте воду со средством для цветов, сохраняя дозировку с упаковки.'], ['Поставьте прохладнее', 'Уберите розы от солнца, сквозняка и созревающих фруктов.']], water: 'Вода должна покрывать срезы, но не нижние листья. Доливайте её по мере расхода.' },
  { key: 'hydrangeas', label: 'Гортензии', title: 'Уход за гортензиями', accent: '#5964a0', lead: 'Гортензии пьют много воды, поэтому проверяйте вазу особенно внимательно.', steps: [['Срежьте 2–5 см', 'Сделайте чистый срез; если конец стебля одревеснел и цветок поник, удалите этот участок.'], ['Проверяйте каждый день', 'Не ждите, пока уровень заметно снизится: доливайте воду со средством.'], ['Уберите от тепла', 'Поставьте вдали от батареи, сквозняка и прямого солнца.']], water: 'Оставьте цветам хороший запас воды и пополняйте его, как только уровень начинает снижаться.' },
  { key: 'tulips', label: 'Тюльпаны', title: 'Уход за тюльпанами', accent: '#d06b72', lead: 'Тюльпаны продолжают расти и поворачиваться к свету даже после срезки.', steps: [['Срежьте 2–3 см', 'Используйте чистый острый нож или ножницы.'], ['Поставьте в чистую воду', 'Добавьте средство для луковичных или универсальное по инструкции на упаковке.'], ['Помогите согнувшимся стеблям', 'Оберните тюльпаны бумагой или плёнкой и оставьте пить воду примерно на час.'], ['Найдите прохладное место', 'Уберите от прямого солнца и сквозняка.']], water: 'Поддерживайте воду чистой и регулярно пополняйте её, не погружая листья.' },
  { key: 'gerberas', label: 'Герберы', title: 'Уход за герберами', accent: '#c76532', lead: 'Стебли гербер чувствительны к загрязнению, поэтому им особенно нужна чистая стеклянная ваза.', steps: [['Срежьте 2–3 см', 'Используйте чистый нож или секатор.'], ['Для букета только из гербер', 'Налейте около 0,5 л воды и используйте средство, рассчитанное на этот объём.'], ['Для смешанного букета', 'Ориентируйтесь на размер вазы и другие цветы; средство разводите по инструкции.'], ['Защитите от тепла', 'Уберите от солнца, сквозняка и батареи.']], water: 'Для монобукета гербер подойдёт около 0,5 л. В смешанном букете воды может понадобиться больше.' },
  { key: 'eustoma', label: 'Эустома', title: 'Уход за эустомой', accent: '#8262a0', lead: 'Эустома много пьёт и лучше чувствует себя в чистой воде.', steps: [['Срежьте 2–5 см', 'Используйте чистый нож или секатор.'], ['Уберите нижние листья', 'Листья не должны находиться в воде.'], ['Регулярно доливайте', 'Добавляйте воду со средством в пропорции с упаковки.'], ['Уберите от фруктов и тепла', 'Не ставьте на солнце, сквозняке или у батареи.']], water: 'Проверяйте уровень каждый день и доливайте воду, не погружая нижние листья.' },
  { key: 'chrysanthemums', label: 'Хризантемы', title: 'Уход за хризантемами', accent: '#8c6b27', lead: 'Чистая вода помогает крепким стеблям хризантем свободно пить.', steps: [['Срежьте 2–3 см', 'Используйте чистый острый нож или секатор.'], ['Уберите листья из воды', 'Так вода дольше останется чистой.'], ['Доливайте свежую воду', 'Средство для цветов применяйте по инструкции.'], ['Не перегревайте', 'Держите вдали от солнца, батареи, сквозняка и созревающих фруктов.']], water: 'Поддерживайте воду чистой и пополняйте её по мере расхода.' },
];

const CARE_BY_KEY = new Map(FLOWER_CARE_OPTIONS.map((profile) => [profile.key, profile]));

export function getFlowerCare(key) {
  const normalized = String(key || '') === 'foam' ? 'composition' : String(key || '');
  return CARE_BY_KEY.get(normalized) || GENERAL;
}

function searchableProductText(product) {
  return [product?.title, product?.name, product?.description, ...(Array.isArray(product?.composition) ? product.composition.map((item) => item?.name || item) : [])]
    .map((value) => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е'))
    .join(' ');
}

export function isFloralFoamArrangement(product) {
  return /флористическ[а-я]*\s+губ|(^|[^\p{L}])оазис([^\p{L}]|$)|корзин[а-я]*|коробк[а-я]*|сумочк[а-я]*|биофлор[а-я]*/u.test(searchableProductText(product));
}

export function getProductFlowerCare(product) {
  const flowerKeys = [...new Set(getProductFlowers(product).map((flower) => flower.key))];
  const profiles = flowerKeys.map((key) => CARE_BY_KEY.get(key)).filter(Boolean);
  const arrangementKey = isPreservedComposition(product) ? 'preserved' : isFloralFoamArrangement(product) ? 'composition' : 'bouquet';
  const primary = arrangementKey === 'preserved'
    ? PRESERVED
    : arrangementKey === 'composition'
    ? FOAM
    : flowerKeys.length === 1 && profiles.length === 1 ? profiles[0] : GENERAL;
  return { arrangementKey, flowerKeys, profiles, primary };
}

export function calculateCylindricalWaterMl(diameterCm, waterHeightCm) {
  const diameter = Number(diameterCm);
  const height = Number(waterHeightCm);
  if (!Number.isFinite(diameter) || !Number.isFinite(height) || diameter <= 0 || height <= 0 || diameter > 60 || height > 60) return null;
  return Math.round(Math.PI * ((diameter / 2) ** 2) * height);
}

// Shared by the care preview and its full catalog selection.
export function matchesCareProfile(product, selectedKey) {
  if (selectedKey === 'preserved') return isPreservedComposition(product);
  const arrangement = isFloralFoamArrangement(product) || /композици/iu.test(String(product?.title || product?.name || ''));
  if (selectedKey === 'composition') return arrangement && !isPreservedComposition(product);
  if (arrangement || isPreservedComposition(product)) return false;
  if (selectedKey === 'bouquet') return true;
  return getProductFlowers(product).some(flower => flower.key === selectedKey);
}

export function careSelectionTitle(key) {
  return ({ bouquet: 'Букеты FLOWIE', composition: 'Композиции в коробках и корзинах', preserved: 'Композиции надолго', roses: 'Букеты с розами', hydrangeas: 'Букеты с гортензиями', tulips: 'Букеты с тюльпанами', gerberas: 'Букеты с герберами', eustoma: 'Букеты с эустомой', chrysanthemums: 'Букеты с хризантемами' })[key] || 'Букеты FLOWIE';
}
