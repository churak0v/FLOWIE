import { useEffect, useState } from 'react';
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
import { AnalyticsPage } from './pages/Analytics';
import { DeliveryZonesPage } from './pages/DeliveryZones';
import { ProfilePage } from './pages/Profile';
import { ProfileWorkingHoursPage } from './pages/ProfileWorkingHours';
import { ProfileStaffPage } from './pages/ProfileStaff';
import { Surface } from '../src/components/ui/Surface';
import { Text } from '../src/components/ui/Text';
import { AppShell } from '../src/components/layout/AppShell';

function AdminFrame({ user }) {
  const role = String(user?.role || '');
  const canManageCatalog = role === 'admin' || role === 'moderator';
  const isAdmin = role === 'admin';
  return (
    <>
      {/* Keep the scroll container stable (no route wrapper transforms) so fixed UI never "jumps". */}
      <AppShell style={{ '--app-content-inset-bottom': '0px' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersPage user={user} />} />
          <Route path="/orders/:id" element={<OrderDetailsPage user={user} />} />

          <Route path="/products" element={canManageCatalog ? <ProductsPage /> : <Navigate to="/orders" replace />} />
          <Route path="/products/new" element={canManageCatalog ? <ProductNewPage /> : <Navigate to="/orders" replace />} />
          <Route path="/products/:id" element={canManageCatalog ? <ProductEditPage /> : <Navigate to="/orders" replace />} />

          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:id" element={<ChatThreadPage />} />
          <Route path="/cash" element={isAdmin ? <CashPage /> : <Navigate to="/orders" replace />} />
          <Route path="/analytics" element={isAdmin ? <AnalyticsPage /> : <Navigate to="/orders" replace />} />
          <Route path="/delivery" element={isAdmin ? <DeliveryZonesPage /> : <Navigate to="/orders" replace />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
          <Route path="/profile/working-hours" element={isAdmin ? <ProfileWorkingHoursPage /> : <Navigate to="/profile" replace />} />
          <Route path="/profile/staff" element={isAdmin ? <ProfileStaffPage /> : <Navigate to="/profile" replace />} />

          <Route path="/collections" element={canManageCatalog ? <CollectionsPage /> : <Navigate to="/orders" replace />} />
          <Route path="/collections/new" element={canManageCatalog ? <CollectionNewPage /> : <Navigate to="/orders" replace />} />
          <Route path="/collections/:id" element={canManageCatalog ? <CollectionEditPage /> : <Navigate to="/orders" replace />} />

          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </AppShell>

      <AdminBottomNav role={role} />
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
          <Text variant="subtitle">Первичная настройка админа</Text>
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
