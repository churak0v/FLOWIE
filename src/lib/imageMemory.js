const seen = new Map();
const decoded = new Map();
const MAX_SEEN = 300;
const MAX_DECODED = 32;

export function wasImageDisplayed(key) { return seen.has(key); }
export function rememberDisplayedImage(key, element) {
  if (!key || !element?.complete || !element.naturalWidth) return;
  const src = element.currentSrc || element.src;
  if (!src) return;
  seen.delete(key); seen.set(key, src);
  if (seen.size > MAX_SEEN) seen.delete(seen.keys().next().value);
  // Keep the actual displayed resource alive, never prefetch a full-size original.
  decoded.delete(key); decoded.set(key, element);
  if (decoded.size > MAX_DECODED) decoded.delete(decoded.keys().next().value);
}

export function imageMemoryStats() { return { seen: seen.size, retained: decoded.size }; }
