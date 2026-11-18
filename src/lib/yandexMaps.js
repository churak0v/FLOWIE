let mapsPromise = null;
let loadedKey = '';

export function loadYandexMaps(apiKey) {
  if (globalThis.ymaps?.Map) return Promise.resolve(globalThis.ymaps);
  if (mapsPromise && loadedKey === apiKey) return mapsPromise;
  loadedKey = apiKey;
  mapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('flowie-yandex-maps-api');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'flowie-yandex-maps-api';
    script.async = true;
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
    const timeout = globalThis.setTimeout(() => reject(new Error('YANDEX_MAPS_LOAD_TIMEOUT')), 12_000);
    script.onload = () => {
      globalThis.clearTimeout(timeout);
      if (!globalThis.ymaps?.ready) {
        reject(new Error('YANDEX_MAPS_UNAVAILABLE'));
        return;
      }
      globalThis.ymaps.ready(() => resolve(globalThis.ymaps));
    };
    script.onerror = () => {
      globalThis.clearTimeout(timeout);
      reject(new Error('YANDEX_MAPS_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    mapsPromise = null;
    throw error;
  });
  return mapsPromise;
}
