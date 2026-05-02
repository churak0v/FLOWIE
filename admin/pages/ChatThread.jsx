import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ImagePlus, SendHorizonal } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { getSocket } from '../lib/socket';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

function Bubble({ side, children }) {
  const isMe = side === 'me';
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '88%',
          padding: '10px 12px',
          borderRadius: 18,
          background: isMe ? 'var(--text)' : 'var(--surface)',
          color: isMe ? 'var(--c-white)' : 'var(--text)',
          border: isMe ? 0 : '1px solid var(--border)',
          boxShadow: isMe ? 'var(--shadow-1)' : 'none',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ChatThreadPage() {
  const navigate = useNavigate();
  const params = useParams();
  const id = params.id;

  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);

  const [text, setText] = useState('');
  const [file, setFile] = useState(null);

  const scrollRef = useRef(null);
  const lastId = useMemo(() => (messages.length ? messages[messages.length - 1].id : null), [messages]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const [cRes, mRes] = await Promise.all([adminApi.getChat(id), adminApi.getChatMessages(id)]);
      setChat(cRes?.chat || null);
      setMessages(mRes?.messages || []);
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось загрузить чат');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // Realtime via WebSocket (socket.io)
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();

    const onMessage = (m) => {
      if (!m || String(m.chatId) !== String(id)) return;
      setMessages((prev) => {
        if (prev.some((x) => x.id === m.id)) return prev;
        return [...prev, m];
      });
    };

    socket.on('message', onMessage);
    socket.emit('joinChat', { chatId: id });

    return () => {
      socket.off('message', onMessage);
    };
  }, [id]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lastId]);

  async function send() {
    if (sending) return;
    const t = text.trim();
    if (!t && !file) return;

    setSending(true);
    try {
      let attachmentUrl = null;
      if (file) {
        attachmentUrl = await adminApi.uploadFile(file);
        setFile(null);
      }
      setText('');
      const socket = getSocket();
      const ack = await new Promise((resolve, reject) => {
        socket.emit('sendMessage', { chatId: id, text: t || null, attachmentUrl }, (ack) => {
          if (ack?.ok) return resolve(ack);
          return reject(new Error(ack?.error || 'SEND_FAILED'));
        });
      });
      if (ack?.message?.id) {
        setMessages((prev) => (prev.some((x) => x.id === ack.message.id) ? prev : [...prev, ack.message]));
      }
    } catch (e) {
      alert(e?.data?.error || e?.message || 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  const title = chat?.orderId ? `Чат по заказу № ${chat.orderId}` : `Чат #${id}`;

  return (
    <div style={{ paddingBottom: 180 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="ui-iconButton"
          style={{ background: 'var(--surface)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>{title}</div>
        <div />
      </div>

      {busy ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <Text variant="caption">
              Клиент: {chat?.user?.name || chat?.user?.username || `User #${chat?.userId || ''}`}
            </Text>
          </div>

          <div
            ref={scrollRef}
            className="hide-scrollbar"
            style={{
              marginTop: 12,
              height: 'calc(var(--app-vh) - 260px)',
              overflow: 'auto',
              padding: 12,
              borderRadius: 'var(--r-lg)',
              background: 'transparent',
              border: '1px solid var(--c-ink-06)',
              display: 'grid',
              gap: 10,
            }}
          >
            {messages.length === 0 ? (
              <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
                <Text variant="body" muted>
                  Пока нет сообщений.
                </Text>
              </Surface>
            ) : (
              messages.map((m) => (
                <Bubble key={m.id} side={m.senderRole === 'staff' ? 'me' : 'them'}>
                  {m.attachmentUrl ? (
                    <img
                      src={m.attachmentUrl}
                      alt=""
                      style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 14, marginBottom: m.text ? 8 : 0 }}
                    />
                  ) : null}
                  {m.text ? <div>{m.text}</div> : null}
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 11, fontWeight: 800 }}>
                    {new Date(m.createdAt).toLocaleString('ru-RU')}
                  </div>
                </Bubble>
              ))
            )}
          </div>

          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              /* Keep composer visible above the keyboard. */
              bottom: 'var(--app-keyboard-offset)',
              paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
              paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
              paddingBottom: 'calc(84px + 10px + var(--app-inset-bottom))',
              pointerEvents: 'none',
              zIndex: 60,
            }}
          >
            <div style={{ width: 'min(100%, var(--app-max))', margin: '0 auto', pointerEvents: 'auto' }}>
              <Surface variant="soft" style={{ padding: 10, borderRadius: 'var(--r-lg)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title="Прикрепить фото"
                  >
                    <ImagePlus size={18} />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>

                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={file ? 'Фото выбрано. Добавьте текст (опц.)…' : 'Сообщение…'}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 40,
                      borderRadius: 14,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      background: 'var(--c-white)',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') send();
                    }}
                  />

                  <button
                    type="button"
                    onClick={send}
                    disabled={sending}
                    style={{
                      width: 44,
                      height: 40,
                      borderRadius: 14,
                      border: 0,
                      background: sending ? 'var(--c-ink-14)' : 'var(--text)',
                      color: 'var(--c-white)',
                      cursor: sending ? 'default' : 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Отправить"
                  >
                    <SendHorizonal size={18} />
                  </button>
                </div>
                {file ? (
                  <div style={{ marginTop: 8 }}>
                    <Text variant="caption">Фото: {file.name}</Text>
                  </div>
                ) : null}
              </Surface>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
