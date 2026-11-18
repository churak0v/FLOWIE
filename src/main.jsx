import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { telegramReady } from './telegram'

let KEYBOARD_BASELINE_PX = 0;

function readCssPxVar(name) {
    try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
        const n = Number.parseFloat(String(raw || ''));
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function updateKeyboardOffsetVar() {
    try {
        const vv = window.visualViewport;
        const docEl = document.documentElement;
        if (!docEl) return;

        // Telegram mirrors viewportStableHeight into CSS. Prefer it as a baseline when available.
        const tgStable = readCssPxVar('--tg-viewport-stable-height');
        const layoutH = Math.max(Number(window.innerHeight || 0), Number(docEl.clientHeight || 0));

        if (Number.isFinite(tgStable) && tgStable > 0) {
            // Some clients may change this value when the keyboard opens; keep the max observed.
            KEYBOARD_BASELINE_PX = Math.max(KEYBOARD_BASELINE_PX, tgStable);
        } else {
            KEYBOARD_BASELINE_PX = Math.max(KEYBOARD_BASELINE_PX, layoutH);
        }

        if (!vv) {
            const offset = Math.max(0, KEYBOARD_BASELINE_PX - layoutH);
            document.documentElement.style.setProperty('--app-keyboard-offset-js', `${Math.round(offset)}px`);
            return;
        }

        // Keep fixed UI behind the on-screen keyboard on iOS/Android WebViews.
        // Use VisualViewport bottom edge vs stable baseline. Works even when innerHeight also shrinks.
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

// Initialize Telegram Mini App runtime as early as possible (safe-area + viewport vars before first paint).
telegramReady();


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
