import { io } from 'socket.io-client';
import { getTelegramInitData } from '../telegram';

const API_URL = import.meta.env.VITE_API_URL || '/api';

let socket = null;

function buildSocketConfig() {
  const initData = getTelegramInitData();

  // If API_URL is absolute, extract origin and keep the pathname for the WS path.
  if (/^https?:\/\//i.test(API_URL)) {
    const u = new URL(API_URL);
    const origin = `${u.protocol}//${u.host}`;
    const path = `${u.pathname.replace(/\/$/, '')}/socket.io`;
    return { origin, path, initData };
  }

  return { origin: undefined, path: `${API_URL.replace(/\/$/, '')}/socket.io`, initData };
}

export function getSocket() {
  if (socket) return socket;

  const cfg = buildSocketConfig();
  socket = io(cfg.origin, {
    path: cfg.path,
    auth: { initData: cfg.initData },
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  return socket;
}

