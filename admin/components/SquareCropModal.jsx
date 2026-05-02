import React, { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { X } from 'lucide-react';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // We crop local objectURLs and same-origin uploads; CORS shouldn't be needed.
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function getCroppedSquareBlob(imageSrc, cropPixels, { size = 1024, quality = 0.86 } = {}) {
  const img = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const outSize = clamp(Number(size) || 1024, 256, 2048);
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');

  // Draw the crop into a fixed square output for faster loading.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const sx = Math.max(0, Math.round(cropPixels.x));
  const sy = Math.max(0, Math.round(cropPixels.y));
  const sw = Math.max(1, Math.round(cropPixels.width));
  const sh = Math.max(1, Math.round(cropPixels.height));

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outSize, outSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('BLOB_FAILED');
  return blob;
}

export function SquareCropModal({
  open,
  imageSrc,
  title = 'Кадрирование',
  onCancel,
  onConfirm,
  size = 1024,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropPixels(null);
    setBusy(false);
  }, [open, imageSrc]);

  const canConfirm = Boolean(open && imageSrc && cropPixels && !busy);

  const zoomMin = 1;
  const zoomMax = 3;

  const contentPadding = useMemo(() => {
    return (
      'calc(var(--sp-4) + var(--app-inset-top)) ' +
      'calc(var(--sp-4) + var(--app-inset-right)) ' +
      'calc(var(--sp-4) + var(--app-inset-bottom)) ' +
      'calc(var(--sp-4) + var(--app-inset-left))'
    );
  }, []);

  if (!open) return null;

  return (
    <>
      <div
        onClick={busy ? undefined : onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.38)',
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 210,
          display: 'grid',
          placeItems: 'center',
          padding: contentPadding,
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: 'min(100%, var(--app-max))', pointerEvents: 'auto' }}>
          <Surface
            variant="soft"
            style={{
              padding: 14,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-2)',
              background: 'var(--bg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text variant="subtitle">{title}</Text>
              <button
                type="button"
                onClick={busy ? undefined : onCancel}
                aria-label="Закрыть"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: 18,
                  overflow: 'hidden',
                  background: 'rgba(0,0,0,0.65)',
                  border: '1px solid var(--c-ink-10)',
                }}
              >
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, areaPixels) => setCropPixels(areaPixels)}
                  restrictPosition
                  objectFit="horizontal-cover"
                  showGrid={false}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <Text variant="caption">Масштаб</Text>
                <input
                  type="range"
                  min={zoomMin}
                  max={zoomMax}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value) || 1)}
                  style={{ width: '100%', marginTop: 6 }}
                />
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={busy ? undefined : onCancel}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 'var(--r-lg)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  fontWeight: 1000,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={async () => {
                  if (!cropPixels) return;
                  setBusy(true);
                  try {
                    const blob = await getCroppedSquareBlob(imageSrc, cropPixels, { size });
                    onConfirm?.(blob);
                  } catch (e) {
                    setBusy(false);
                    alert(e?.message || 'Не удалось кадрировать');
                  }
                }}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: 'var(--r-lg)',
                  border: 0,
                  background: canConfirm ? 'var(--text)' : 'var(--c-ink-10)',
                  color: 'var(--c-white)',
                  fontWeight: 1000,
                  cursor: canConfirm ? 'pointer' : 'default',
                }}
              >
                {busy ? 'Готовим…' : 'Готово'}
              </button>
            </div>
          </Surface>
        </div>
      </div>
    </>
  );
}

