export function formatPrepTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // If the value already contains units/text, keep as-is.
  // We only auto-append minutes for plain numbers/ranges like "45" or "35-55".
  const digitsOnly = /^\d+$/;
  const rangeOnly = /^\d+\s*[-–—]\s*\d+$/;

  if (digitsOnly.test(raw)) return `${raw} min`;
  if (rangeOnly.test(raw)) return `${raw.replace(/\s*[-–—]\s*/, '-')} min`;

  return raw;
}

export function toUiComposition(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (!x || typeof x !== 'object') return '';
      const name = String(x.name ?? '').trim();
      const quantity = String(x.quantity ?? '').trim();
      if (!name && !quantity) return '';
      if (name && quantity) return `${name} · ${quantity}`;
      return name || quantity;
    })
    .filter(Boolean);
}

export function toUiSize(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return '';
  if (w <= 0 || h <= 0) return '';
  return `${w}×${h}`;
}
