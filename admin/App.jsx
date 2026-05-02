import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { adminApi } from './lib/adminApi';
import { getTelegramUserSafe } from '../src/telegram';
import { AdminBottomNav } from './components/AdminBottomNav';
import { OrdersPage } from './pages/Orders';
import { OrderDetailsPage } from './pages/OrderDetails';
import { ProductsPage } from './pages/Products';
import { ProductEditPage, ProductNewPage } from './pages/ProductUpsert';
import { CollectionsPage } from './pages/Collections';
import { CollectionEditPage, CollectionNewPage } from './pages/CollectionUpsert';
import { ChatsPage } from './pages/Chats';
import { ChatThreadPage } from './pages/ChatThread';
import { CashPage } from './pages/Cash';
import { ProfilePage } from './pages/Profile';
import { ProfileWorkingHoursPage } from './pages/ProfileWorkingHours';
import { ProfileStaffPage } from './pages/ProfileStaff';
import { Surface } from '../src/components/ui/Surface';
import { Text } from '../src/components/ui/Text';
import { AppShell } from '../src/components/layout/AppShell';

function AdminFrame({ user }) {
  return (
    <>
      {/* Keep the scroll container stable (no route wrapper transforms) so fixed UI never "jumps". */}
      <AppShell style={{ '--app-content-inset-bottom': '0px' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailsPage />} />

          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<ProductNewPage />} />
          <Route path="/products/:id" element={<ProductEditPage />} />

          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:id" element={<ChatThreadPage />} />
          <Route path="/cash" element={<CashPage />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
          <Route path="/profile/working-hours" element={<ProfileWorkingHoursPage />} />
          <Route path="/profile/staff" element={<ProfileStaffPage />} />

          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/new" element={<CollectionNewPage />} />
          <Route path="/collections/:id" element={<CollectionEditPage />} />

          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </AppShell>

      <AdminBottomNav />
    </>
  );
}

function Unauthorized() {
  const tg = getTelegramUserSafe();
  return (
    <div className="ui-appShell">
      <Text variant="title">Нет доступа</Text>
      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
          <Text variant="subtitle">Откройте админку в Telegram</Text>
          <div style={{ marginTop: 6 }}>
            <Text variant="body" muted>
              Админка авторизуется через Telegram initData. Если вы открыли ее в обычном браузере, доступ будет закрыт.
            </Text>
          </div>
        </Surface>

        <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
          <Text variant="subtitle">Bootstrap первого админа</Text>
          <div style={{ marginTop: 6 }}>
            <Text variant="body" muted>
              Добавьте ваш Telegram ID в переменную `ADMIN_TG_IDS` на API-сервере (через запятую) и перезапустите контейнер.
            </Text>
          </div>
          <div style={{ marginTop: 10 }}>
            <Text variant="caption">Ваш TG ID: {tg?.id || 'не определен'}</Text>
          </div>
        </Surface>
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [bootError, setBootError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setBootError('');

    adminApi
      .me()
      .then((res) => {
        if (!alive) return;
        setMe(res?.user || null);
      })
      .catch((e) => {
        if (!alive) return;
        setMe(null);
        setBootError(e?.data?.error || e?.message || 'UNAUTHORIZED');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <BrowserRouter>
      {loading ? (
        <div className="ui-appShell">
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)' }}>
            <Text variant="subtitle">Загружаем админку…</Text>
            {bootError ? (
              <div style={{ marginTop: 6 }}>
                <Text variant="body" muted>
                  {bootError}
                </Text>
              </div>
            ) : null}
          </Surface>
        </div>
      ) : me ? (
        <AdminFrame user={me} />
      ) : (
        <Unauthorized />
      )}
    </BrowserRouter>
  );
}
