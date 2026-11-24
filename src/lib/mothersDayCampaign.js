export const MOTHERS_DAY_CATALOG_HREF = '/catalog?occasion=mothers-day';
export const MOTHERS_DAY_DELIVERY_DATE = '2026-11-29';

export function isMothersDayCampaignActive(now = new Date()) {
  const localDay = (now.getFullYear() * 10_000) + ((now.getMonth() + 1) * 100) + now.getDate();
  return localDay >= 20261125 && localDay <= 20261129;
}
