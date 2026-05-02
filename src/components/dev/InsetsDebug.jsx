import React, { useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readCssVar(name) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return '';
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

export function InsetsDebug() {
  const [closed, setClosed] = useState(false);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let alive = true;

    const take = () => {
      if (!alive) return;
      try {
        const safe = WebApp?.safeAreaInset || WebApp?.safeAreaInsets || null;
        const content = WebApp?.contentSafeAreaInset || WebApp?.contentSafeAreaInsets || null;

        const css = {
          '--app-inset-top': readCssVar('--app-inset-top'),
          '--app-inset-right': readCssVar('--app-inset-right'),
          '--app-inset-bottom': readCssVar('--app-inset-bottom'),
          '--app-inset-left': readCssVar('--app-inset-left'),
          '--app-nav-inset-bottom': readCssVar('--app-nav-inset-bottom'),
          '--app-tg-header-fallback': readCssVar('--app-tg-header-fallback'),
          '--tg-safe-area-inset-top': readCssVar('--tg-safe-area-inset-top'),
          '--tg-safe-area-inset-right': readCssVar('--tg-safe-area-inset-right'),
          '--tg-safe-area-inset-bottom': readCssVar('--tg-safe-area-inset-bottom'),
          '--tg-safe-area-inset-left': readCssVar('--tg-safe-area-inset-left'),
          '--tg-content-safe-area-inset-top': readCssVar('--tg-content-safe-area-inset-top'),
          '--tg-content-safe-area-inset-right': readCssVar('--tg-content-safe-area-inset-right'),
          '--tg-content-safe-area-inset-bottom': readCssVar('--tg-content-safe-area-inset-bottom'),
          '--tg-content-safe-area-inset-left': readCssVar('--tg-content-safe-area-inset-left'),
          '--app-env-safe-area-inset-top': readCssVar('--app-env-safe-area-inset-top'),
          '--app-env-safe-area-inset-right': readCssVar('--app-env-safe-area-inset-right'),
          '--app-env-safe-area-inset-bottom': readCssVar('--app-env-safe-area-inset-bottom'),
          '--app-env-safe-area-inset-left': readCssVar('--app-env-safe-area-inset-left'),

          '--tg-viewport-height': readCssVar('--tg-viewport-height'),
          '--tg-viewport-stable-height': readCssVar('--tg-viewport-stable-height'),
          '--app-vh': readCssVar('--app-vh'),
          '--app-keyboard-offset': readCssVar('--app-keyboard-offset'),
          '--app-keyboard-offset-js': readCssVar('--app-keyboard-offset-js'),
        };

        setSnapshot({
          now: new Date().toISOString(),
          location: pick(window.location, ['href', 'search', 'hash']),
          ua: String(navigator.userAgent || ''),
          webapp: {
            platform: WebApp?.platform,
            version: WebApp?.version,
            isExpanded: WebApp?.isExpanded,
            viewportHeight: WebApp?.viewportHeight,
            viewportStableHeight: WebApp?.viewportStableHeight,
            safeAreaInset: safe,
            contentSafeAreaInset: content,
            initDataLen: String(WebApp?.initData || '').length,
          },
          css,
        });
      } catch (e) {
        setSnapshot({ error: String(e?.message || e) });
      }
    };

    take();
    const id = setInterval(take, 350);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const text = useMemo(() => safeJson(snapshot), [snapshot]);

  if (closed) return null;
  return (
    <div
      role="dialog"
      aria-label="Insets debug"
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 10000,
        width: 'min(420px, calc(100vw - 32px))',
        maxHeight: 'min(80vh, calc(100vh - 32px))',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.88)',
        color: '#c9ffb0',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 14,
        padding: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 11,
        lineHeight: 1.35,
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 12, color: '#fff' }}>Insets debug</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(text);
              } catch {
                // ignore
              }
            }}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => setClosed(true)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 900,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <pre style={{ margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{text}</pre>
    </div>
  );
}
