import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { isAnalyticsEnabled } from './lib/analytics'
import { initYandexMetrica } from './lib/yandexMetrica'
import { initVkPixel } from './lib/vkPixel'

let KEYBOARD_BASELINE_PX = 0;

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

        const layoutH = Math.max(Number(window.innerHeight || 0), Number(docEl.clientHeight || 0));
        KEYBOARD_BASELINE_PX = Math.max(KEYBOARD_BASELINE_PX, layoutH);

        if (!vv) {
            const offset = Math.max(0, KEYBOARD_BASELINE_PX - layoutH);
            document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
            return;
        }

        // Safari's address/tab bars also shrink VisualViewport while the user scrolls.
        // Treat the missing area as a keyboard only while an editable control is focused;
        // otherwise fixed purchase/navigation controls get pushed underneath browser chrome.
        const visibleBottom = Number(vv.offsetTop || 0) + Number(vv.height || 0);
        const occluded = Math.max(0, KEYBOARD_BASELINE_PX - visibleBottom);
        const offset = hasEditableFocus() && occluded >= 120 ? occluded : 0;
        document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
    } catch {
        // ignore
    }
}

if (typeof window !== 'undefined') {
    // The SPA owns route restoration; a second native history restore causes jumps.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    initYandexMetrica({ enabled: isAnalyticsEnabled() });
    initVkPixel({ enabled: isAnalyticsEnabled() });
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

console.log("Main.jsx is running!");

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 'calc(32px + env(safe-area-inset-top, 0px)) 24px', color: 'var(--text)', maxWidth: 430, margin: '0 auto' }}>
                    <h1 style={{ fontSize: 25 }}>Не удалось открыть страницу</h1>
                    <p>Обновите страницу и попробуйте ещё раз.</p>
                    <button type="button" onClick={() => window.location.reload()} style={{ padding: '12px 20px', border: 0, borderRadius: 16, background: 'var(--accent)', color: '#fff', fontWeight: 800 }}>Обновить страницу</button>
                    {import.meta.env.DEV ? <details style={{ whiteSpace: 'pre-wrap', marginTop: 20 }}>
                        {this.state.error && this.state.error.toString()}
                    </details> : null}
                </div>
            );
        }

        return this.props.children;
    }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
    console.error("Root element not found!");
} else {
    console.log("Root element found, mounting React...");
    createRoot(rootElement).render(
        <StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </StrictMode>,
    );
}
