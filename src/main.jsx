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
                <div style={{ padding: 20, color: 'red', fontSize: 20 }}>
                    <h1>Something went wrong.</h1>
                    <p>Check console for details.</p>
                    <details style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.error && this.state.error.toString()}
                    </details>
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
