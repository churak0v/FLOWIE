export const CURRENT_USER = {
  address: {
    street: 'Большая Спасская',
    house: '35',
  },
};

export const MOCK_ASSETS = {
  hero: 'https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?auto=format&fit=crop&w=1400&q=80',
  bouquet1: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=1200&q=80',
  bouquet2: 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?auto=format&fit=crop&w=1200&q=80',
  bouquet3: 'https://images.unsplash.com/photo-1487530903081-59e0e3331512?auto=format&fit=crop&w=1200&q=80',
  card: 'https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=800&q=80',
  chocolate: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=800&q=80',
  vase: 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=800&q=80',
  recipient: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=900&q=80',
};

export const HERO_SLIDES = [
  {
    id: 'feb14',
    caption: 'Порадуй любимую!',
    subtitle: 'Перейти в подборку для предзаказа',
    image: MOCK_ASSETS.hero,
    href: '/catalog?collection=bright',
  },
];

export const PRODUCTS = [
  {
    id: 1,
    title: 'Наслаждение',
    subtitle: '15 цветов',
    price: 5428,
    categoryId: 'bouquets',
    image: MOCK_ASSETS.bouquet1,
    images: [MOCK_ASSETS.bouquet1, MOCK_ASSETS.bouquet2, MOCK_ASSETS.bouquet3],
    composition: ['7 розовых роз', 'веточки эвкалипта', 'розовая упаковка', 'атласная лента'],
    size: 'S',
    description: 'Лёгкий, аккуратный букет на каждый день.',
    isActive: true,
  },
  {
    id: 2,
    title: 'Нежность',
    subtitle: '11 цветов',
    price: 3924,
    categoryId: 'bouquets',
    image: MOCK_ASSETS.bouquet2,
    images: [MOCK_ASSETS.bouquet2, MOCK_ASSETS.bouquet1, MOCK_ASSETS.bouquet3],
    composition: ['нежные цветы', 'лёгкая зелень', 'светлая упаковка'],
    size: 'S',
    description: 'Нежный букет из смешанных цветов.',
    isActive: true,
  },
  {
    id: 3,
    title: 'Полёт',
    subtitle: '21 цветок',
    price: 7625,
    categoryId: 'premium',
    image: MOCK_ASSETS.bouquet3,
    images: [MOCK_ASSETS.bouquet3, MOCK_ASSETS.bouquet2, MOCK_ASSETS.bouquet1],
    composition: ['премиальный состав', 'объёмный букет', 'лента в тон'],
    size: 'M',
    description: 'Большой букет, который производит впечатление.',
    isActive: true,
  },
];

export const COLLECTIONS = [
  {
    id: 'compositions',
    title: 'Композиции',
    productIds: [1, 2, 3],
  },
  {
    id: 'for-mom',
    title: 'Маме',
    productIds: [2, 1, 3],
  },
  {
    id: 'bright',
    title: 'Яркие',
    productIds: [3, 1, 2],
  },
];

export const SCENARIOS = [
  {
    id: 'first-date',
    title: 'Первое свидание',
    description: 'Лёгкий жест без повода.',
    productIds: [2, 1, 3],
  },
  {
    id: 'birthday',
    title: 'День рождения',
    description: 'Чтобы запомнилось.',
    productIds: [3, 1, 2],
  },
  {
    id: 'for-mom-2',
    title: 'Маме',
    description: 'Тёплое “спасибо”.',
    productIds: [1, 2, 3],
  },
];

export const UPSELLS = [
  { id: 'card', title: 'Открытка', price: 0, imageUrl: MOCK_ASSETS.card, isFree: true, isActive: true, sort: 1 },
  { id: 'choco', title: 'Шоколад', price: 290, imageUrl: MOCK_ASSETS.chocolate, isFree: false, isActive: true, sort: 2 },
  { id: 'vase', title: 'Ваза', price: 590, imageUrl: MOCK_ASSETS.vase, isFree: false, isActive: true, sort: 3 },
];

// Admin mocks (legacy UI)
export const ADMIN_ORDERS = [
  { id: 1001, status: 'completed', date: 'Today', time: '14:30', customer: 'Александр', items: ['Наслаждение'], total: 5428, payment: 'paid' },
  { id: 1002, status: 'new', date: 'Today', time: '15:45', customer: 'Елена', items: ['Пионы (5 шт)'], total: 3200, payment: 'pending' },
  { id: 1003, status: 'delivery', date: 'Today', time: '16:00', customer: 'Максим', items: ['Розы (15 шт)'], total: 4500, payment: 'paid' },
  { id: 1004, status: 'completed', date: 'Yesterday', time: '10:00', customer: 'Ольга', items: ['Композиция №3'], total: 2800, payment: 'paid' },
  { id: 1005, status: 'new', date: 'Tomorrow', time: '09:00', customer: 'Дмитрий', items: ['Букет весенний'], total: 3500, payment: 'paid' },
];

export const ADMIN_STATS = {
  day: { turnover: 13128, avgCheck: 4376, rating: 4.9, conversion: 12, chart: [20, 45, 30, 80, 55, 40] },
  week: { turnover: 86500, avgCheck: 4100, rating: 4.8, conversion: 15, chart: [40, 60, 45, 90, 75, 50, 65] },
  month: { turnover: 345000, avgCheck: 3950, rating: 4.7, conversion: 11, chart: [50, 70, 60, 80] },
};
