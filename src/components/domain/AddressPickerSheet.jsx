import React, { useEffect, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { Surface } from '../ui/Surface';
import { Text } from '../ui/Text';
import { useAppState } from '../../state/AppState';
import { reverseGeocodeOSM } from '../../lib/reverseGeocode';
import { requestLocation } from '../../telegram';

export function AddressPickerSheet({ open, onClose }) {
  const { state, actions } = useAppState();

  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [coords, setCoords] = useState(null); // { lat, lon }
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!open) return;
    setStreet(state.delivery?.address?.street || '');
    setHouse(state.delivery?.address?.house || '');
    setCoords(state.delivery?.coords || null);
    setHint('');
    setBusy(false);
  }, [open, state.delivery]);

  const canSave = Boolean(street.trim()) && Boolean(house.trim());

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Text variant="title">Адрес доставки</Text>

        <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              setHint('');
              try {
                const loc = await requestLocation();
                if (!loc) {
                  setHint('Не удалось получить геопозицию. Можно ввести адрес вручную.');
                  return;
                }
                setCoords(loc);

                try {
                  const geo = await reverseGeocodeOSM(loc);
                  if (geo?.street) setStreet(geo.street);
                  if (geo?.house != null) setHouse(geo.house);
                } catch {
                  // ignore reverse-geocode failure
                }
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            style={{
              width: '100%',
              height: 52,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              cursor: busy ? 'default' : 'pointer',
              fontWeight: 900,
              color: 'var(--text)',
            }}
          >
            <LocateFixed size={18} />
            {busy ? 'Определяем…' : 'Определить по геопозиции'}
          </button>

          {hint ? (
            <div style={{ marginTop: 10 }}>
              <Text variant="caption">{hint}</Text>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <div>
              <Text variant="caption">Улица</Text>
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Например, Невский проспект"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>

            <div>
              <Text variant="caption">Дом</Text>
              <input
                value={house}
                onChange={(e) => setHouse(e.target.value)}
                placeholder="Например, 35"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>
          </div>
        </Surface>

        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            if (!canSave) return;

            actions.setDeliveryAddress({ street: street.trim(), house: house.trim() });
            actions.setDeliveryCoords(coords);

            onClose?.();
          }}
          style={{
            height: 56,
            borderRadius: 'var(--r-lg)',
            border: 0,
            background: canSave ? 'var(--accent)' : 'var(--c-ink-14)',
            color: 'var(--c-white)',
            fontWeight: 900,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          Сохранить
        </button>
      </div>
    </BottomSheet>
  );
}
