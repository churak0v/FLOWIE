export function normalizeImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || /^(?:https?:|data:|blob:)/i.test(value) || value.startsWith('/')) return value;
  return '/' + value;
}

export function imageSizes(variant = 'card') {
  if (variant === 'hero' || variant === 'detail') return '(max-width: 430px) 100vw, 430px';
  if (variant === 'thumb') return '80px';
  if (variant === 'tile') return '156px';
  return '(max-width: 430px) calc((100vw - 50px) / 2), 190px';
}

export function imageVariantPlan(raw, { buildSha = '', siteOrigin = '' } = {}) {
  const original = normalizeImageUrl(raw);
  if (!original || /^(?:data:|blob:)/i.test(original)) return null;
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(original.split(/[?#]/, 1)[0])) return null;
  let parsed;
  try { parsed = new URL(original, siteOrigin || 'https://flowie.invalid'); } catch { return null; }
  const absolute = /^https?:/i.test(original);
  const owned = !absolute || parsed.origin === siteOrigin || /^(?:www\.|admin\.)?flowie\.art$/i.test(parsed.hostname);
  if (!owned) return null;
  const file = parsed.pathname;
  // Uploaded files are content-addressed or UUID-based, including nested imports.
  const upload = /^\/uploads\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(file);
  const bundled = /^\/(?:hero|banners|upsells|assets)\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(file)
    || /^\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(file);
  if (!upload && !bundled) return null;
  const widths = upload ? [320, 640, 1280] : [320, 640, 1280, 1920];
  const params = new URLSearchParams(parsed.search);
  if (bundled && buildSha) params.set('v', buildSha);
  const query = params.size ? '?' + params.toString() : '';
  const base = (absolute ? parsed.origin : '') + file;
  const variantUrl = (width, format) => `${base}@${width}.${format}${query}`;
  return {
    kind: upload ? 'upload' : 'static', widths,
    original: base + query,
    avif: widths.map(width => `${variantUrl(width, 'avif')} ${width}w`).join(', '),
    webp: widths.map(width => `${variantUrl(width, 'webp')} ${width}w`).join(', '),
    fallback: variantUrl(640, 'webp'),
  };
}
