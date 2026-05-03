export function cleanProductSubtitle(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d+\s*(?:[-–—]\s*\d+\s*)?min(?:ute)?s?$/i.test(raw)) return '';
  return raw;
}
