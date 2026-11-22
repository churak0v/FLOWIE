import React, { useState } from 'react';

function normalizeAssetUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^(?:https?:|data:|blob:)/i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return '/' + s;
}

const DEFAULT_FALLBACK =
  'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=1200&q=80';

// Generated variants exist for uploads (3 sizes) and bundled public photos
// (4 sizes). Third-party images are never rewritten.
function variantSources(url) {
  const upload = /^\/uploads\/[0-9a-f-]+\.(?:jpe?g|png|webp)$/i.test(url);
  const staticPhoto = /^\/(?:hero|upsells|assets)\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(url) ||
    /^\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url);
  if (!upload && !staticPhoto) return null;

  const widths = upload ? [320, 640, 1280] : [320, 640, 1280, 1920];
  const revision = staticPhoto && import.meta.env.VITE_BUILD_SHA
    ? '?v=' + encodeURIComponent(import.meta.env.VITE_BUILD_SHA) : '';
  const srcset = ext => widths.map(width => url + '@' + width + '.' + ext + revision + ' ' + width + 'w').join(', ');
  return { avif: srcset('avif'), webp: srcset('webp'), revision };
}

export function AppImage({
  src, alt = '', fallback = DEFAULT_FALLBACK, onError,
  variant = 'card', sizes, ...props
}) {
  const [failedVariant, setFailedVariant] = useState('');
  const [failedOriginal, setFailedOriginal] = useState('');
  const original = normalizeAssetUrl(src);
  const fallbackUrl = normalizeAssetUrl(fallback) || DEFAULT_FALLBACK;
  const originalFailed = !original || original === failedOriginal;
  const sources = !originalFailed && failedVariant !== original ? variantSources(original) : null;
  const staticPhoto = original.startsWith('/hero/') || original.startsWith('/upsells/') ||
    original.startsWith('/assets/') || /^\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(original);
  const rev = staticPhoto && import.meta.env.VITE_BUILD_SHA ? '?v=' + encodeURIComponent(import.meta.env.VITE_BUILD_SHA) : '';
  const finalSrc = originalFailed ? fallbackUrl : original + rev;

  const handleError = event => {
    if (sources && failedVariant !== original) setFailedVariant(original);
    else if (!originalFailed) setFailedOriginal(original);
    onError?.(event);
  };

  if (!sources) {
    return <img {...props} src={finalSrc} alt={alt}
      loading={props.loading || 'eager'} decoding={props.decoding || 'async'}
      referrerPolicy="no-referrer" onError={handleError} />;
  }

  const styles = props.style || {};
  const { style, className, ...imgProps } = props;
  const responsiveSizes = sizes || (
    variant === 'hero' ? '100vw'
      : variant === 'detail' ? '(max-width: 600px) 100vw, 800px'
        : variant === 'thumb' ? '80px'
          : variant === 'tile' ? '156px'
            : '(max-width: 600px) 45vw, 320px'
  );
  return (
    <picture className={className} style={{ ...styles, display: styles.display || 'block' }}>
      <source type="image/avif" srcSet={sources.avif} sizes={responsiveSizes} />
      <source type="image/webp" srcSet={sources.webp} sizes={responsiveSizes} />
      <img {...imgProps} key={finalSrc + ':responsive'} src={finalSrc} alt={alt}
        loading={imgProps.loading || 'eager'} decoding={imgProps.decoding || 'async'}
        referrerPolicy="no-referrer" onError={handleError}
        style={{
          display: 'block', width: '100%',
          height: styles.height === 'auto' && !styles.aspectRatio ? 'auto' : '100%',
          aspectRatio: styles.aspectRatio, objectFit: styles.objectFit,
          objectPosition: styles.objectPosition, borderRadius: styles.borderRadius,
          filter: styles.filter,
        }}
      />
    </picture>
  );
}
