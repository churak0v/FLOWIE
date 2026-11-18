const CENTER = [53.2115, 56.8526]; // longitude, latitude: Izhevsk

class MapsError extends Error {
    constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

function mapConfig(env = process.env) {
    const enabled = env.YANDEX_MAPS_ENABLED === 'true';
    return {
        enabled: enabled && Boolean(env.YANDEX_MAPS_JS_API_KEY),
        mapApiKey: enabled ? (env.YANDEX_MAPS_JS_API_KEY || '') : '',
        suggestEnabled: enabled && Boolean(env.YANDEX_MAPS_SUGGEST_API_KEY),
        geocodeEnabled: enabled && Boolean(env.YANDEX_MAPS_GEOCODER_API_KEY),
        center: CENTER,
    };
}

function queryText(value, min = 3) {
    if (typeof value !== 'string' || value.trim().length < min || value.length > 300) {
        throw new MapsError('BAD_ADDRESS_QUERY', 400);
    }
    return value.trim();
}

async function providerJson(endpoint, params, key, env, fetchImpl) {
    if (env.YANDEX_MAPS_ENABLED !== 'true' || !key) throw new MapsError('MAPS_NOT_CONFIGURED');
    const url = new URL(endpoint);
    Object.entries({ ...params, apikey: key }).forEach(([name, value]) => url.searchParams.set(name, value));
    try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (!response.ok) throw new MapsError('MAPS_PROVIDER_UNAVAILABLE', 502);
        return await response.json();
    } catch {
        // Never propagate provider URLs, keys, or user addresses into logs/errors.
        throw new MapsError('MAPS_PROVIDER_UNAVAILABLE', 502);
    }
}

async function suggest(value, { env = process.env, fetchImpl = fetch } = {}) {
    const text = queryText(value);
    const data = await providerJson('https://suggest-maps.yandex.ru/v1/suggest', {
        text, lang: 'ru', results: '6', types: 'house,street', countries: 'ru',
        ll: CENTER.join(','), spn: '0.6,0.4', print_address: '1', highlight: '0',
    }, env.YANDEX_MAPS_SUGGEST_API_KEY, env, fetchImpl);
    return { items: (Array.isArray(data.results) ? data.results : []).slice(0, 6).map((item) => ({
        title: String(item.title?.text || '').slice(0, 300),
        subtitle: String(item.subtitle?.text || '').slice(0, 300),
        value: String(item.address?.formatted_address || [item.subtitle?.text, item.title?.text].filter(Boolean).join(', ')).slice(0, 300),
    })).filter((item) => item.value) };
}

async function geocode(value, { env = process.env, fetchImpl = fetch } = {}) {
    const address = queryText(value);
    const data = await providerJson('https://geocode-maps.yandex.ru/v1/', {
        geocode: address, format: 'json', lang: 'ru_RU', results: '1', ll: CENTER.join(','), spn: '0.6,0.4',
    }, env.YANDEX_MAPS_GEOCODER_API_KEY, env, fetchImpl);
    const object = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    if (!object) throw new MapsError('ADDRESS_NOT_FOUND', 404);
    const [lon, lat] = String(object.Point?.pos || '').trim().split(/\s+/).map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new MapsError('MAPS_PROVIDER_UNAVAILABLE', 502);
    }
    const metadata = object.metaDataProperty?.GeocoderMetaData;
    return { address: String(metadata?.text || address).slice(0, 500), coords: { lat, lon },
        precision: metadata?.precision || null, kind: metadata?.kind || null };
}

module.exports = { MapsError, mapConfig, suggest, geocode };
