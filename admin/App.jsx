import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { adminApi } from './lib/adminApi';
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
import { HomeBannersPage } from './pages/HomeBanners';
import { ProfilePage } from './pages/Profile';
import { ProfileWorkingHoursPage } from './pages/ProfileWorkingHours';
import { ProfileStaffPage } from './pages/ProfileStaff';
import { Surface } from '../src/components/ui/Surface';
import { Text } from '../src/components/ui/Text';
import { AppShell } from '../src/components/layout/AppShell';

function AdminFrame({ user, onLogout }) {
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
          <Route path="/profile/banners" element={isAdmin ? <HomeBannersPage /> : <Navigate to="/profile" replace />} />
          <Route path="/profile" element={<ProfilePage user={user} onLogout={onLogout} />} />
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

function Unauthorized({ onAuthenticated, error: bootError }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!login.trim() || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await adminApi.login({ login: login.trim(), password });
      await onAuthenticated(response?.user || null);
    } catch (loginError) {
      const code = loginError?.data?.error || loginError?.message;
      if (code === 'ADMIN_LOGIN_RATE_LIMITED') setError('Слишком много попыток. Попробуйте позже.');
      else if (code === 'ADMIN_LOGIN_NOT_CONFIGURED') setError('Вход ещё не настроен на сервере.');
      else setError('Неверный логин или пароль.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-appShell">
      <Text variant="title">Вход в кабинет</Text>
      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Surface variant="soft" style={{ padding: 18, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <div>
              <Text variant="subtitle">Логин</Text>
              <input
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                autoComplete="username"
                name="username"
                placeholder="Логин администратора"
                style={{ width: '100%', height: 50, marginTop: 8, padding: '0 14px', borderRadius: 15, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>
            <div>
              <Text variant="subtitle">Пароль</Text>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                name="password"
                placeholder="Пароль"
                style={{ width: '100%', height: 50, marginTop: 8, padding: '0 14px', borderRadius: 15, border: '1px solid var(--border)', background: 'var(--surface)' }}
              />
            </div>
            {(error || bootError === 'FORBIDDEN') ? (
              <div style={{ color: '#b42318' }}><Text variant="caption">{error || 'Сессия не имеет доступа к кабинету.'}</Text></div>
            ) : null}
            <button
              type="submit"
              disabled={busy || !login.trim() || !password}
              style={{ height: 52, border: 0, borderRadius: 'var(--r-lg)', background: 'var(--accent)', color: '#fff', fontWeight: 1000, opacity: busy || !login.trim() || !password ? 0.55 : 1 }}
            >
              {busy ? 'Входим…' : 'Войти'}
            </button>
          </form>
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

  async function finishLogin(user) {
    setLoading(true);
    setBootError('');
    try {
      if (user) setMe(user);
      else {
        const res = await adminApi.me({ force: true });
        setMe(res?.user || null);
      }
    } catch (e) {
      setMe(null);
      setBootError(e?.data?.error || e?.message || 'UNAUTHORIZED');
    } finally {
      setLoading(false);
    }
  }

  async function finishLogout() {
    try {
      await adminApi.logout();
    } finally {
      setMe(null);
      setBootError('');
    }
  }

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
        <AdminFrame user={me} onLogout={finishLogout} />
      ) : (
        <Unauthorized onAuthenticated={finishLogin} error={bootError} />
      )}
    </BrowserRouter>
  );
}
