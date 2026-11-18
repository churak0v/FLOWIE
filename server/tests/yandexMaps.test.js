const test = require('node:test');
const assert = require('node:assert/strict');
const { mapConfig, suggest, geocode } = require('../services/yandexMaps');
const env = { YANDEX_MAPS_ENABLED: 'true', YANDEX_MAPS_JS_API_KEY: 'public-js',
    YANDEX_MAPS_SUGGEST_API_KEY: 'private-suggest', YANDEX_MAPS_GEOCODER_API_KEY: 'private-geocode' };

test('public map configuration exposes only JS key and defaults disabled', () => {
    assert.equal(mapConfig({}).enabled, false);
    const result = mapConfig(env);
    assert.equal(result.mapApiKey, 'public-js');
    assert.equal(JSON.stringify(result).includes('private'), false);
    assert.deepEqual(result.center, [53.2115, 56.8526]);
});

test('disabled integration and invalid input do not contact provider', async () => {
    const fetchImpl = () => { throw new Error('must not fetch'); };
    await assert.rejects(suggest('Ленина', { env: {}, fetchImpl }), { code: 'MAPS_NOT_CONFIGURED' });
    for (const input of ['', ['address'], 'x'.repeat(301)]) {
        await assert.rejects(geocode(input, { env, fetchImpl }), { code: 'BAD_ADDRESS_QUERY' });
    }
});

test('suggest biases Izhevsk and returns full address without provider internals', async () => {
    const result = await suggest('Пушкинская 1', { env, fetchImpl: async (url) => {
        assert.equal(url.origin, 'https://suggest-maps.yandex.ru');
        assert.equal(url.searchParams.get('ll'), '53.2115,56.8526');
        assert.equal(url.searchParams.get('apikey'), 'private-suggest');
        return { ok: true, json: async () => ({ results: [{ title: { text: 'Пушкинская, 1' },
            subtitle: { text: 'Ижевск' }, address: { formatted_address: 'Ижевск, Пушкинская, 1' } }] }) };
    } });
    assert.equal(result.items[0].value, 'Ижевск, Пушкинская, 1');
});

test('geocoder preserves lon/lat order and precision', async () => {
    const result = await geocode('Ижевск, Пушкинская, 1', { env, fetchImpl: async () => ({ ok: true,
        json: async () => ({ response: { GeoObjectCollection: { featureMember: [{ GeoObject: {
            Point: { pos: '53.21 56.85' }, metaDataProperty: { GeocoderMetaData: { text: 'Ижевск, Пушкинская, 1', precision: 'exact', kind: 'house' } },
        } }] } } }),
    }) });
    assert.deepEqual(result.coords, { lat: 56.85, lon: 53.21 });
    assert.equal(result.precision, 'exact');
});

test('provider failure never leaks URL or key; empty match is 404', async () => {
    await assert.rejects(suggest('Ленина', { env, fetchImpl: async () => { throw new Error('secret-url'); } }),
        { message: 'MAPS_PROVIDER_UNAVAILABLE', status: 502 });
    await assert.rejects(geocode('Ленина', { env, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
        { code: 'ADDRESS_NOT_FOUND', status: 404 });
});
