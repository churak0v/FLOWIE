import { useEffect, useRef, useState } from 'react';
import { loadYandexMaps } from '../../src/lib/yandexMaps';

export function DeliveryZoneMap({ config, initialPolygon, zones, zoneId, onChange }) {
  const container = useRef(null);
  const polygon = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState('');
  useEffect(() => {
    if (!config?.enabled || !config?.mapApiKey) return undefined;
    let alive = true;
    let map;
    loadYandexMaps(config.mapApiKey).then(ymaps => {
      if (!alive) return;
      map = new ymaps.Map(container.current, { center: [56.8526, 53.2115], zoom: 11, controls: ['zoomControl'] });
      for (const zone of zones) {
        if (zone.id === zoneId || zone.polygon.length < 3) continue;
        map.geoObjects.add(new ymaps.Polygon([zone.polygon], {}, { fillColor: '#88888822', strokeColor: '#999999', strokeWidth: 1 }));
      }
      const shape = new ymaps.Polygon(initialPolygon.length ? [initialPolygon] : [], {}, {
        fillColor: '#c6536d33', strokeColor: '#c6536d', strokeWidth: 3,
        editorMaxPoints: 200, editorDrawingCursor: 'crosshair',
      });
      polygon.current = shape;
      map.geoObjects.add(shape);
      shape.events.add('geometrychange', () => onChangeRef.current(shape.geometry.getCoordinates()[0] || []));
      if (initialPolygon.length >= 3) map.setBounds(shape.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 25 });
      setReady(true);
    }).catch(() => { if (alive) setError('Карта не загрузилась. Проверьте ключ Яндекса и разрешённые домены.'); });
    return () => { alive = false; polygon.current = null; map?.destroy(); };
    // A new editor is mounted when switching the zone; point edits must not recreate its map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.enabled, config?.mapApiKey]);
  if (!config?.enabled || !config?.mapApiKey || error) return <div style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 16, background: 'var(--surface-2)', lineHeight: 1.5 }}>
    <strong>{error ? 'Карта недоступна' : 'Подключите Яндекс Карты'}</strong>
    <p style={{ marginBottom: 0 }}>{error || 'После подключения ключа можно обвести зону на карте. Пока сохраните название, тариф и условия как черновик.'}</p>
  </div>;
  return <div style={{ display: 'grid', gap: 8 }}>
    <div ref={container} aria-label="Карта границ зоны" style={{ height: 340, borderRadius: 16, overflow: 'hidden', background: 'var(--surface-2)' }} />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="ui-chip" disabled={!ready || editorBusy} onClick={async () => {
        const shape = polygon.current;
        if (!shape) return;
        setEditorBusy(true);
        setEditorError('');
        try {
          if (drawing) { shape.editor.stopDrawing(); shape.editor.stopEditing(); }
          else {
            await shape.editor.startEditing();
            if (polygon.current !== shape) return;
            await shape.editor.startDrawing();
          }
          if (polygon.current === shape) setDrawing(!drawing);
        } catch {
          if (polygon.current === shape) setEditorError('Не удалось включить редактор. Попробуйте ещё раз.');
        } finally {
          if (polygon.current === shape) setEditorBusy(false);
        }
      }}>{drawing ? 'Завершить границу' : 'Рисовать / изменить границу'}</button>
      <button type="button" className="ui-chip" disabled={!ready || editorBusy} onClick={() => { polygon.current.geometry.setCoordinates([]); onChangeRef.current([]); }}>Очистить границу</button>
    </div>
    {editorError ? <small role="alert" style={{ color: '#b42318' }}>{editorError}</small> : null}
    <small style={{ color: 'var(--muted)' }}>Нажимайте на карту по периметру зоны. Точки можно перетаскивать. Завершите границу перед сохранением.</small>
  </div>;
}
