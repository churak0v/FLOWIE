import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import App from './App.jsx';

let KEYBOARD_BASELINE_PX = 0;

function updateKeyboardOffsetVar() {
  try {
    const vv = window.visualViewport;
    const docEl = document.documentElement;
    if (!docEl) return;

    const layoutH = Math.max(Number(window.innerHeight || 0), Number(docEl.clientHeight || 0));
    KEYBOARD_BASELINE_PX = Math.max(KEYBOARD_BASELINE_PX, layoutH);

    if (!vv) {
      const offset = Math.max(0, KEYBOARD_BASELINE_PX - layoutH);
      document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
      return;
    }

    const visibleBottom = Number(vv.offsetTop || 0) + Number(vv.height || 0);
    const offset = Math.max(0, KEYBOARD_BASELINE_PX - visibleBottom);
    document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  updateKeyboardOffsetVar();
  window.addEventListener('resize', updateKeyboardOffsetVar);
  window.addEventListener('orientationchange', updateKeyboardOffsetVar);
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
