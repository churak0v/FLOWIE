const PACKAGING = /упаков|лент[аы]?\b|лента|тишью|пл[её]нк|фоамиран|бумаг|корзин|коробк|кашпо|сумочк|оазис|оформлен|пакет|аквабокс|шляпн/i;

export function splitProductComposition(items) {
  const botanical = [], packaging = [];
  for (const item of Array.isArray(items) ? items : []) {
    let name, quantity;
    if (typeof item === 'string') {
      const parts = item.split('·');
      name = parts[0]?.trim(); quantity = parts.slice(1).join('·').trim();
    } else if (item && typeof item === 'object') {
      name = String(item.name || '').trim(); quantity = String(item.quantity ?? '').trim();
    }
    if (!name) continue;
    (PACKAGING.test(name) ? packaging : botanical).push({ name, quantity: quantity || '' });
  }
  return { botanical, packaging };
}
