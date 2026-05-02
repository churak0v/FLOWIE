import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { api } from '../api';

const CHAT_LIST_CACHE = {
  ts: 0,
  chats: [],
};
const CHAT_LIST_TTL_MS = 10_000;

export function Inbox() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chats, setChats] = useState([]);

  useEffect(() => {
    let alive = true;
    const now = Date.now();
    const hasFreshCache = CHAT_LIST_CACHE.chats?.length && now - CHAT_LIST_CACHE.ts < CHAT_LIST_TTL_MS;
    if (hasFreshCache) {
      setChats(CHAT_LIST_CACHE.chats);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }

    api
      .getChats()
      .then((res) => {
        if (!alive) return;
        const next = Array.isArray(res?.chats) ? res.chats : [];
        CHAT_LIST_CACHE.ts = Date.now();
        CHAT_LIST_CACHE.chats = next;
        setChats(next);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.data?.error || e?.message || 'Не удалось загрузить чаты');
        if (!hasFreshCache) setChats([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const ordered = useMemo(() => {
    const list = Array.isArray(chats) ? chats : [];
    const support = list.filter((c) => !c.orderId);
    const orders = list.filter((c) => c.orderId);
    // Support chat pinned on top, then order chats by updatedAt desc.
    return [
      ...support.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      ...orders.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    ];
  }, [chats]);

  return (
    <>
      <AppShell style={{ display: 'flex', flexDirection: 'column', '--app-content-inset-bottom': '0px' }}>
        <Text variant="title">Чат</Text>

        <div style={{ marginTop: 'var(--sp-6)', display: 'grid', gap: 12 }}>
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
          ) : ordered.length ? (
            ordered.map((c) => {
              const isSupport = !c.orderId;
              const title = isSupport ? 'Поддержка' : `Заказ №${c.orderId}`;
              const last = c.lastMessage?.text ? String(c.lastMessage.text) : isSupport ? 'Напишите нам, мы на связи' : 'Чат по заказу';
              const time = c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

              return (
                <Surface
                  key={c.id}
                  variant="soft"
                  onClick={() => navigate(`/chat/${c.id}`)}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--r-lg)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Text variant="subtitle">{title}</Text>
                    <div style={{ marginTop: 6 }}>
                      <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {last}
                      </Text>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {isSupport ? <Star size={18} color="var(--accent)" fill="var(--accent)" /> : null}
                    <Text variant="caption">{time}</Text>
                  </div>
                </Surface>
              );
            })
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
                <Text variant="subtitle">Пока нет чатов</Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted>
                    Чаты появятся после оформления заказа.
                  </Text>
                </div>
              </Surface>
            </div>
          )}
        </div>
      </AppShell>
    </>
  );
}
