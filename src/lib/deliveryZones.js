const SPB_CENTER = { lat: 59.93863, lon: 30.31413 }; // Palace Square-ish

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lon1 = Number(a.lon);
  const lat2 = Number(b.lat);
  const lon2 = Number(b.lon);
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return null;

  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

export const SPB_DELIVERY_ZONES = [
  { id: 'center', title: 'Center', maxKm: 6, price: 199, eta: '35-55 min' },
  { id: 'near', title: 'Nearby', maxKm: 15, price: 299, eta: '45-65 min' },
  { id: 'far', title: 'Suburbs', maxKm: 30, price: 399, eta: '55-75 min' },
  { id: 'outside', title: 'Outside zone', maxKm: Infinity, price: null, eta: null, unavailable: true },
];

export function getZoneById(id) {
  return SPB_DELIVERY_ZONES.find((z) => z.id === id) || null;
}

export function getZoneForDistanceKm(km) {
  if (km == null) return null;
  return SPB_DELIVERY_ZONES.find((z) => km <= z.maxKm) || SPB_DELIVERY_ZONES[SPB_DELIVERY_ZONES.length - 1];
}

export function getZoneForCoords(coords) {
  const km = haversineKm(coords, SPB_CENTER);
  const zone = getZoneForDistanceKm(km);
  return zone ? { ...zone, km } : null;
}

