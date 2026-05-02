import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

const CHATS_CACHE = {
  items: null,
};

function lastMessageSnippet(chat) {
  const m = (chat.messages || [])[0];
  if (!m) return 'Нет сообщений';
  if (m.attachmentUrl && m.text) return `${m.text} (фото)`;
  if (m.attachmentUrl) return 'Фото';
  return m.text || 'Сообщение';
}

export function ChatsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => CHATS_CACHE.items || []);
  const [busy, setBusy] = useState(() => !(CHATS_CACHE.items || []).length);
  const [error, setError] = useState('');

  async function load(opts = {}) {
    // Keep the list on screen when refreshing, so switching tabs doesn't flash skeletons.
    const { silent = false, ...apiOpts } = opts || {};
    if (!silent) setBusy(items.length === 0);
    if (!silent) setError('');
    try {
      const res = await adminApi.getChats(apiOpts);
      const next = res?.chats || [];
      CHATS_CACHE.items = next;
      setItems(next);
    } catch (e) {
      if (!silent) setError(e?.data?.error || e?.message || 'Не удалось загрузить чаты');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    if ((CHATS_CACHE.items || []).length) {
      setItems(CHATS_CACHE.items || []);
      setBusy(false);
      load({ silent: true });
      return;
    }
    load();
  }, []);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">Чаты</Text>
        <button
          type="button"
          onClick={() => load({ force: true })}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
        >
          Обновить
        </button>
      </div>

      {busy ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Пока нет чатов</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                Чат создается из заказа. Откройте заказ и нажмите «Написать в чат».
              </Text>
            </div>
          </Surface>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {items.map((c) => (
            <Surface
              key={c.id}
              variant="soft"
              onClick={() => navigate(`/chats/${c.id}`)}
              style={{
                padding: 14,
                borderRadius: 'var(--r-lg)',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.user?.name || c.user?.username || `User #${c.userId}`}
                  </Text>
                  <div style={{ marginTop: 6 }}>
                    <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lastMessageSnippet(c)}
                    </Text>
                  </div>
                  {c.orderId ? (
                    <div style={{ marginTop: 6 }}>
                      <Text variant="caption">Заказ № {c.orderId}</Text>
                    </div>
                  ) : null}
                </div>
                <span className="ui-chip" style={{ borderColor: 'transparent', background: 'var(--surface)' }}>
                  <MessageSquare size={16} />
                  <span style={{ fontSize: 12, fontWeight: 900 }}>#{c.id}</span>
                </span>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
