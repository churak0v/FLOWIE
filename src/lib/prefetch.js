const PREFETCHED = new Set();
const MEMORY_CACHE = new Map(); // url -> Image
const MAX_MEMORY = 60;

function shouldPrefetch() {
  try {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c?.saveData) return false;
    const type = String(c?.effectiveType || '').toLowerCase();
    if (type.includes('2g')) return false;
    return true;
  } catch {
    return true;
  }
}

function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (s.startsWith('/')) return s;
  return `/${s}`;
}

export function prefetchImages(urls, { max = 10 } = {}) {
  try {
    if (typeof window === 'undefined') return;
    if (!Array.isArray(urls) || urls.length === 0) return;
    if (!shouldPrefetch()) return;

    const unique = [];
    for (const raw of urls) {
      const url = normalizeUrl(raw);
      if (!url) continue;
      if (MEMORY_CACHE.has(url)) continue;
      if (PREFETCHED.has(url)) continue;
      PREFETCHED.add(url);
      unique.push(url);
      if (unique.length >= max) break;
    }

    if (!unique.length) return;

    const remember = (url, img) => {
      if (MEMORY_CACHE.has(url)) return;
      MEMORY_CACHE.set(url, img);
      if (MEMORY_CACHE.size > MAX_MEMORY) {
        const firstKey = MEMORY_CACHE.keys().next().value;
        if (firstKey) {
          MEMORY_CACHE.delete(firstKey);
          PREFETCHED.delete(firstKey);
        }
      }
    };

    const run = () => {
      for (const url of unique) {
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.src = url;
        remember(url, img);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      setTimeout(run, 50);
    }
  } catch {
    // ignore
  }
}
