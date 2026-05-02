import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, SendHorizontal } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { getSocket } from '../lib/socket';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';

const CHAT_THREAD_CACHE = new Map(); // chatId -> { ts, chat, messages }
const CHAT_THREAD_TTL_MS = 10_000;

function formatTime(d) {
  try {
    return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ChatThread() {
  const params = useParams();
  const chatId = Number(params.id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);

  const title = useMemo(() => {
    if (!chat) return 'Чат';
    if (!chat.orderId) return 'Поддержка';
    return `Заказ №${chat.orderId}`;
  }, [chat]);

  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(chatId)) return;

    const now = Date.now();
    const cached = CHAT_THREAD_CACHE.get(chatId);
    const hasFreshCache = cached && now - cached.ts < CHAT_THREAD_TTL_MS;
    if (hasFreshCache) {
      setChat(cached.chat || null);
      setMessages(Array.isArray(cached.messages) ? cached.messages : []);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }

    api
      .getChatMessages(chatId)
      .then((res) => {
        if (!alive) return;
        setChat(res?.chat || null);
        setMessages(Array.isArray(res?.messages) ? res.messages : []);
        CHAT_THREAD_CACHE.set(chatId, {
          ts: Date.now(),
          chat: res?.chat || null,
          messages: Array.isArray(res?.messages) ? res.messages : [],
        });
      })
      .catch((e) => {
        if (!alive) return;
        if (!hasFreshCache) {
          setError(e?.data?.error || e?.message || 'Не удалось загрузить чат');
          setChat(null);
          setMessages([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [chatId]);

  // Socket.IO realtime
  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    const socket = getSocket();
    const onMessage = (msg) => {
      if (Number(msg?.chatId) !== chatId) return;
      setMessages((prev) => {
        const next = [...prev, msg];
        const cached = CHAT_THREAD_CACHE.get(chatId);
        CHAT_THREAD_CACHE.set(chatId, { ts: Date.now(), chat: cached?.chat || null, messages: next });
        return next;
      });
    };

    socket.on('message', onMessage);
    socket.emit('joinChat', { chatId }, () => {});

    return () => {
      socket.off('message', onMessage);
    };
  }, [chatId]);

  useEffect(() => {
    // Keep the latest message visible.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, loading]);

  const canSend = Boolean(text.trim()) && !loading && !error;

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconButton onClick={() => navigate(-1)} aria-label="Назад">
            <ChevronLeft size={22} />
          </IconButton>
          <Text variant="title">{title}</Text>
        </div>

        <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 10 }}>
          {loading ? (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
              <Text variant="subtitle">Загружаем…</Text>
            </Surface>
          ) : error ? (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
              <Text variant="subtitle">Ошибка</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  {error}
                </Text>
              </div>
            </Surface>
          ) : (
            <>
              {messages.map((m) => {
                const mine = m.senderRole === 'client';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '78%',
                        borderRadius: 18,
                        padding: '10px 12px',
                        background: mine ? 'var(--accent)' : 'var(--surface)',
                        color: mine ? 'var(--c-white)' : 'var(--text)',
                        border: mine ? '1px solid transparent' : '1px solid var(--border)',
                        boxShadow: mine ? 'var(--shadow-accent)' : 'none',
                      }}
                    >
                      {m.text ? (
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                          {m.text}
                        </div>
                      ) : null}
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, opacity: 0.8, textAlign: 'right' }}>
                        {formatTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </>
          )}
        </div>
      </AppShell>

      {/* Input bar: stays above the keyboard, while BottomNav (on other pages) stays behind it. */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          // Keep the input above Telegram UI and slide it up with the keyboard.
          // Avoid CSS max() for compatibility with older Telegram iOS WebViews.
          transform: 'translateX(-50%) translateY(calc(-1 * var(--app-keyboard-offset)))',
          bottom: 'var(--app-inset-bottom)',
          width: 'min(100%, var(--app-max))',
          paddingTop: 'var(--sp-4)',
          paddingBottom: 'var(--sp-4)',
          paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
          paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
          zIndex: 70,
          background: 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-1)',
            padding: 10,
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Сообщение…"
            style={{
              flex: 1,
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 700,
              minWidth: 0,
            }}
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => {
              const t = text.trim();
              if (!t) return;
              setText('');
              try {
                const socket = getSocket();
                socket.emit('sendMessage', { chatId, text: t }, () => {});
              } catch {
                // REST fallback
                api
                  .sendChatMessage(chatId, { text: t })
                  .then((res) => {
                    if (res?.message) setMessages((prev) => [...prev, res.message]);
                  })
                  .catch(() => {});
              }
            }}
            aria-label="Отправить"
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              border: 0,
              background: canSend ? 'var(--accent)' : 'var(--c-ink-14)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: canSend ? 'pointer' : 'default',
              flexShrink: 0,
            }}
          >
            <SendHorizontal size={18} color="var(--c-white)" strokeWidth={3} />
          </button>
        </div>
      </div>
    </>
  );
}
