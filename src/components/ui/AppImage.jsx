import { useState } from 'react';
import { imageSizes, imageVariantPlan, normalizeImageUrl } from '../../lib/imageSources';
import { rememberDisplayedImage, wasImageDisplayed } from '../../lib/imageMemory';

const DEFAULT_FALLBACK = '/flowie-icon.svg';

export function AppImage({ src, alt = '', fallback = DEFAULT_FALLBACK, onError, onLoad, variant = 'card', sizes, ...props }) {
  const [failures, setFailures] = useState({});
  const original = normalizeImageUrl(src);
  const plan = imageVariantPlan(original, { buildSha: import.meta.env.VITE_BUILD_SHA || '', siteOrigin: globalThis.location?.origin || '' });
  const key = plan?.original || original;
  const failed = failures[key] || {};
  const originalFailed = !original || failed.original;
  const useVariants = Boolean(plan && !originalFailed && (!failed.avif || !failed.webp));
  const finalSrc = originalFailed ? normalizeImageUrl(fallback) || DEFAULT_FALLBACK
    : useVariants ? plan.fallback : plan?.original || original;
  const warm = !originalFailed && wasImageDisplayed(key);
  const responsiveSizes = sizes || imageSizes(variant);

  const markFailure = format => setFailures(previous => ({ ...previous, [key]: { ...(previous[key] || {}), [format]: true } }));
  const handleError = event => {
    const selected = event.currentTarget.currentSrc || event.currentTarget.src || '';
    if (useVariants && /@\d+\.avif(?:[?#]|$)/i.test(selected)) markFailure('avif');
    else if (useVariants && /@\d+\.webp(?:[?#]|$)/i.test(selected)) markFailure('webp');
    else if (!originalFailed) markFailure('original');
    onError?.(event);
  };
  const handleLoad = event => {
    if (!originalFailed) rememberDisplayedImage(key, event.currentTarget);
    onLoad?.(event);
  };
  const loading = warm ? 'eager' : props.loading || 'eager';
  const decoding = warm ? 'sync' : props.decoding || 'async';

  if (!useVariants) return <img {...props} src={finalSrc} alt={originalFailed ? 'Фотография недоступна' : alt} loading={loading} decoding={decoding} referrerPolicy="no-referrer" onLoad={handleLoad} onError={handleError} data-image-warm={warm || undefined} data-image-optimized="false" />;

  const { style = {}, className, ...imgProps } = props;
  return (
    <picture className={className} style={{ ...style, display: style.display || 'block' }}>
      {!failed.avif ? <source type="image/avif" srcSet={plan.avif} sizes={responsiveSizes} /> : null}
      {!failed.webp ? <source type="image/webp" srcSet={plan.webp} sizes={responsiveSizes} /> : null}
      <img {...imgProps} src={!failed.webp ? finalSrc : plan.original} srcSet={!failed.webp ? plan.webp : undefined} sizes={responsiveSizes} alt={alt}
        loading={loading} decoding={decoding} referrerPolicy="no-referrer" onError={handleError} onLoad={handleLoad}
        data-image-warm={warm || undefined} data-image-optimized="true"
        style={{ display: 'block', width: '100%', height: style.height === 'auto' && !style.aspectRatio ? 'auto' : '100%', aspectRatio: style.aspectRatio, objectFit: style.objectFit, objectPosition: style.objectPosition, borderRadius: style.borderRadius, filter: style.filter }} />
    </picture>
  );
}
