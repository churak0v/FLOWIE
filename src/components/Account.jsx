import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { BottomSheet } from './ui/BottomSheet';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { OrderHistoryList } from './domain/OrderHistoryList';
import { PhoneLogin } from './PhoneLogin';
import { isAnalyticsEnabled, isDoNotTrackEnabled, setAnalyticsOptOut } from '../lib/analytics';

function RowButton({ title, subtitle, onClick, right }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        border: 0,
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <Surface
        variant="soft"
        fullWidth
        style={{
          width: '100%',
          padding: 16,
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          margin: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text
            variant="subtitle"
            style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.25 }}
          >
            {title}
          </Text>
          {subtitle ? (
            <div style={{ marginTop: 6 }}>
              <Text
                variant="body"
                muted
                style={{ whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
              >
                {subtitle}
              </Text>
            </div>
          ) : null}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {right || null}
          <ChevronRight size={20} color="var(--muted)" />
        </div>
      </Surface>
    </button>
  );
}

function openSupport() {
  window.open('https://t.me/flowie_support', '_blank', 'noopener,noreferrer');
}

export function Account() {
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const tg = state.auth.telegramUser;
  const me = state.auth.me;
  const displayName = useMemo(() => {
    if (tg) return [tg.firstName, tg.lastName].filter(Boolean).join(' ') || 'Профиль';
    return me?.name || 'Профиль';
  }, [me?.name, tg]);

  const tag = tg?.username ? `@${tg.username}` : me?.username ? `@${me.username}` : 'Без username';
  const photoUrl = tg?.photoUrl || '';
  const phoneBound = Boolean(me?.phoneVerified);

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => isAnalyticsEnabled());
  const dntEnabled = isDoNotTrackEnabled();

  return (
    <>
      <AppShell style={{ '--app-content-inset-bottom': '0px', padding: 0 }}>
        <div
          style={{
            width: '100%',
            paddingLeft: 'calc(var(--sp-4) + var(--app-inset-left))',
            paddingRight: 'calc(var(--sp-4) + var(--app-inset-right))',
            paddingTop: 'calc(var(--sp-2) + var(--app-inset-top))',
            paddingBottom: 'var(--sp-4)',
            boxSizing: 'border-box',
          }}
        >
          <Text variant="title">Профиль</Text>

          <div
            style={{
              marginTop: 'var(--sp-6)',
              display: 'grid',
              gap: 12,
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
          <Surface
            variant="soft"
            fullWidth
            style={{
              width: '100%',
              padding: 16,
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              maxWidth: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '999px',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  flexShrink: 0,
                }}
              >
                {photoUrl ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tag}
                  </Text>
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <Text variant="caption">Статус</Text>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 1000, color: 'var(--accent)' }}>
                Покупатель
              </div>
            </div>
          </Surface>

          {state.auth.meLoading ? (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="subtitle">Загружаем профиль...</Text>
            </Surface>
          ) : !phoneBound ? (
            <RowButton
              title="Войти по телефону"
              subtitle="Заказы гостя сохранятся, а профиль будет доступен на других устройствах."
              onClick={() => setPhoneOpen(true)}
            />
          ) : (
            <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <Text variant="subtitle">Телефон</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  {me.phone}
                </Text>
              </div>
            </Surface>
          )}

          <RowButton
            title="Связаться с поддержкой"
            subtitle="Вопросы по оплате, доставке или заказу цветов."
            onClick={openSupport}
          />
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: dntEnabled ? 'default' : 'pointer' }}>
              <span style={{ minWidth: 0 }}>
                <Text variant="subtitle">Аналитика использования</Text>
                <span style={{ display: 'block', marginTop: 6 }}>
                  <Text variant="body" muted>
                    {dntEnabled
                      ? 'Отключена настройкой Do Not Track браузера.'
                      : 'Помогает улучшать каталог и оформление без передачи полей форм и сообщений.'}
                  </Text>
                </span>
              </span>
              <input
                type="checkbox"
                checked={analyticsEnabled && !dntEnabled}
                disabled={dntEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setAnalyticsOptOut(!enabled);
                  setAnalyticsEnabled(enabled && !isDoNotTrackEnabled());
                }}
                aria-label="Аналитика использования"
                style={{ width: 22, height: 22, flexShrink: 0 }}
              />
            </label>
          </Surface>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <Text variant="title">История заказов</Text>
            <div style={{ marginTop: 12 }}>
              <OrderHistoryList limit={8} />
            </div>
          </Surface>
          <RowButton title="Согласие на обработку данных" onClick={() => navigate('/legal/consent')} />
          <RowButton title="Политика конфиденциальности" onClick={() => navigate('/legal/privacy')} />
          <RowButton title="Публичная оферта" onClick={() => navigate('/legal/offer')} />
        </div>
        </div>
      </AppShell>

      <BottomSheet open={phoneOpen} onClose={() => setPhoneOpen(false)}>
        <PhoneLogin
          initialPhone={me?.phone || ''}
          onCancel={() => setPhoneOpen(false)}
          onSuccess={async () => {
            await actions.loadMe();
            setPhoneOpen(false);
          }}
        />
      </BottomSheet>
    </>
  );
}
