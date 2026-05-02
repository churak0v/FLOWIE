const CACHE_PREFIX = 'flowie_cache_v1:';

function fullKey(key) {
  return `${CACHE_PREFIX}${String(key || '')}`;
}

export function readCacheEntry(key) {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = Number(parsed.ts);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return { ts, data: parsed.data };
  } catch {
    return null;
  }
}

export function writeCacheEntry(key, data) {
  try {
    localStorage.setItem(fullKey(key), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore
  }
}

export function removeCacheEntry(key) {
  try {
    localStorage.removeItem(fullKey(key));
  } catch {
    // ignore
  }
}

export function isCacheFresh(entry, maxAgeMs) {
  if (!entry) return false;
  const ttl = Number(maxAgeMs);
  if (!Number.isFinite(ttl) || ttl <= 0) return true;
  return Date.now() - entry.ts < ttl;
}

