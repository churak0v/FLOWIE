import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import App from './App.jsx';

let KEYBOARD_BASELINE_PX = 0;

function isIOSWebKit() {
  const ua = String(window.navigator?.userAgent || '');
  return /iPad|iPhone|iPod/i.test(ua) || (window.navigator?.platform === 'MacIntel' && window.navigator?.maxTouchPoints > 1);
}

function hasEditableFocus() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = String(active.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable === true;
}

function updateKeyboardOffsetVar() {
  try {
    const vv = window.visualViewport;
    const docEl = document.documentElement;
    if (!docEl) return;

    const deviceH = isIOSWebKit() ? Number(window.screen?.height || 0) : 0;
    const layoutH = Math.max(Number(window.innerHeight || 0), Number(docEl.clientHeight || 0), deviceH);
    KEYBOARD_BASELINE_PX = Math.max(KEYBOARD_BASELINE_PX, layoutH);

    if (!vv) {
      const offset = Math.max(0, KEYBOARD_BASELINE_PX - layoutH);
      document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
      document.documentElement.style.setProperty('--app-browser-inset-top-js', '0px');
      document.documentElement.style.setProperty('--app-browser-inset-bottom-js', '0px');
      return;
    }

    const visibleBottom = Number(vv.offsetTop || 0) + Number(vv.height || 0);
    const occluded = Math.max(0, KEYBOARD_BASELINE_PX - visibleBottom);
    const offset = hasEditableFocus() && occluded >= 120 ? occluded : 0;
    const browserTop = hasEditableFocus() ? 0 : Math.max(0, Number(vv.offsetTop || 0));
    const browserBottom = hasEditableFocus() ? 0 : Math.min(120, occluded);
    document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
    document.documentElement.style.setProperty('--app-browser-inset-top-js', `${Math.round(browserTop)}px`);
    document.documentElement.style.setProperty('--app-browser-inset-bottom-js', `${Math.round(browserBottom)}px`);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  updateKeyboardOffsetVar();
  window.addEventListener('resize', updateKeyboardOffsetVar);
  window.addEventListener('orientationchange', updateKeyboardOffsetVar);
  window.addEventListener('focusin', updateKeyboardOffsetVar);
  window.addEventListener('focusout', updateKeyboardOffsetVar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardOffsetVar);
    window.visualViewport.addEventListener('scroll', updateKeyboardOffsetVar);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
