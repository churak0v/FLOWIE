export function isActuallyVisible(element, {
  documentLike = globalThis.document,
  windowLike = globalThis.window,
  minIntersectionRatio = 0.5,
  occlusionRoot = element,
} = {}) {
  if (!element || !documentLike || !windowLike) return false;
  if (documentLike.visibilityState !== 'visible' || documentLike.hasFocus?.() !== true) return false;
  if (typeof documentLike.elementFromPoint !== 'function') return false;

  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const viewportWidth = Number(windowLike.innerWidth || documentLike.documentElement?.clientWidth || 0);
  const viewportHeight = Number(windowLike.innerHeight || documentLike.documentElement?.clientHeight || 0);
  const left = Math.max(0, rect.left);
  const right = Math.min(viewportWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(viewportHeight, rect.bottom);
  const visibleWidth = Math.max(0, right - left);
  const visibleHeight = Math.max(0, bottom - top);
  const ratio = (visibleWidth * visibleHeight) / (rect.width * rect.height);
  if (ratio < minIntersectionRatio) return false;

  // Sticky media can remain geometrically visible while the foreground sheet
  // paints over it. Require every sample to resolve to the offer or its child.
  const samples = [
    [0.2, 0.2],
    [0.5, 0.5],
    [0.8, 0.8],
  ];
  return samples.every(([xRatio, yRatio]) => {
    const target = documentLike.elementFromPoint(
      left + visibleWidth * xRatio,
      top + visibleHeight * yRatio,
    );
    return Boolean(target && occlusionRoot && (target === occlusionRoot || occlusionRoot.contains?.(target)));
  });
}
