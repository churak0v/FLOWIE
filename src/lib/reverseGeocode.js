export async function reverseGeocodeOSM(coords) {
  const lat = Number(coords?.lat);
  const lon = Number(coords?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Nominatim has strict usage limits. This is a best-effort MVP helper.
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('accept-language', 'ru');

  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const addr = data?.address || {};

  const street =
    addr.road ||
    addr.pedestrian ||
    addr.residential ||
    addr.footway ||
    addr.path ||
    addr.street ||
    '';
  const house = addr.house_number || '';

  if (!street) return null;
  return { street, house };
}

