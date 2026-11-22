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

// Only immutable, server-owned uploads have generated variants. Images from
// external services and bundled static assets use their normal source URLs.
function variantSources(url) {
  if (!/^\/uploads\/[0-9a-f-]+\.(?:jpe?g|png|webp)$/i.test(url)) return null;
  const suffix = (ext) => [
    [320, url + '@320.' + ext],
    [640, url + '@640.' + ext],
    [1280, url + '@1280.' + ext],
  ].map(([width, src]) => src + ' ' + width + 'w').join(', ');
  return { avif: suffix('avif'), webp: suffix('webp') };
}

export function AppImage({
  src, alt = '', fallback = DEFAULT_FALLBACK, onError,
  variant = 'card', sizes, ...props
}) {
  const original = normalizeAssetUrl(src);
  const fallbackUrl = normalizeAssetUrl(fallback) || DEFAULT_FALLBACK;
  const [failedVariant, setFailedVariant] = useState('');
  const [failedOriginal, setFailedOriginal] = useState('');

  const originalFailed = !original || original === failedOriginal;
  const finalSrc = originalFailed ? fallbackUrl : original;
  const sources = !originalFailed && failedVariant !== original ? variantSources(original) : null;

  const handleError = (event) => {
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
    variant === 'detail' ? '(max-width: 600px) 100vw, 800px'
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
          height: styles.height === 'auto' || !styles.height ? 'auto' : '100%',
          aspectRatio: styles.aspectRatio, objectFit: styles.objectFit,
          objectPosition: styles.objectPosition, borderRadius: styles.borderRadius,
          filter: styles.filter,
        }}
      />
    </picture>
  );
}
