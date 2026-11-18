import { useEffect, useMemo, useRef, useState } from 'react';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';

import { loadYandexMaps } from '../../lib/yandexMaps';

export function YandexDeliveryMap({ config, coords }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const placemarkRef = useRef(null);
  const latestPointRef = useRef(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [loadError, setLoadError] = useState('');
  const enabled = Boolean(config?.enabled && config?.mapApiKey);
  const fallbackCenter = useMemo(() => (
    Array.isArray(config?.center) && config.center.length === 2
      ? [Number(config.center[1]), Number(config.center[0])]
      : [56.8526, 53.2115]
  ), [config?.center]);
  const point = useMemo(() => (
    Number.isFinite(Number(coords?.lat)) && Number.isFinite(Number(coords?.lon))
      ? [Number(coords.lat), Number(coords.lon)]
      : null
  ), [coords?.lat, coords?.lon]);
  latestPointRef.current = point;

  useEffect(() => {
    if (!enabled || !containerRef.current) return undefined;
    let alive = true;
    setLoadError('');
    loadYandexMaps(config.mapApiKey)
      .then((ymaps) => {
        if (!alive || !containerRef.current) return;
        const latestPoint = latestPointRef.current;
        const center = latestPoint || fallbackCenter;
        const map = new ymaps.Map(containerRef.current, {
          center,
          zoom: latestPoint ? 16 : 11,
          controls: ['zoomControl'],
        });
        mapRef.current = map;
        if (latestPoint) {
          const placemark = new ymaps.Placemark(latestPoint, {}, { preset: 'islands#redDotIcon' });
          placemarkRef.current = placemark;
          map.geoObjects.add(placemark);
        }
        setMapReadyVersion((version) => version + 1);
      })
      .catch(() => {
        if (alive) setLoadError('Карта временно недоступна. Адрес можно ввести вручную.');
      });
    return () => {
      alive = false;
      placemarkRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [config?.mapApiKey, enabled, fallbackCenter]);

  useEffect(() => {
    const map = mapRef.current;
    const ymaps = globalThis.ymaps;
    if (!map || !ymaps?.Placemark) return;
    if (placemarkRef.current) {
      map.geoObjects.remove(placemarkRef.current);
      placemarkRef.current = null;
    }
    if (!point) return;
    const placemark = new ymaps.Placemark(point, {}, { preset: 'islands#redDotIcon' });
    placemarkRef.current = placemark;
    map.geoObjects.add(placemark);
    map.setCenter(point, 16, { duration: 250 });
  }, [mapReadyVersion, point]);

  if (!enabled || loadError) {
    return (
      <Surface variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
        <Text variant="caption" muted>
          {loadError || 'Карта пока не настроена. Введите адрес вручную — оформление останется доступно.'}
        </Text>
      </Surface>
    );
  }

  return <div ref={containerRef} aria-label="Карта адреса доставки" style={{ width: '100%', height: 220, borderRadius: 18, overflow: 'hidden', background: 'var(--surface-2)' }} />;
}
