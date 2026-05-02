import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 12,
  background: 'var(--c-white)',
};

export function ProfileStaffPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const [staff, setStaff] = useState([]);
  const [newStaff, setNewStaff] = useState({
    telegramId: '',
    staffRole: 'moderator',
    name: '',
    username: '',
    phone: '',
  });

  async function load() {
    setBusy(true);
    setError('');
    try {
      const st = await adminApi.getStaff();
      setStaff(st?.staff || []);
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось загрузить staff');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ paddingBottom: 0 }}>
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
        <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>Пользователи</div>
        <div />
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title" style={{ fontSize: 20 }}>
          Staff доступ
        </Text>
        <button
          type="button"
          onClick={load}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
        >
          Обновить
        </button>
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
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Добавить</Text>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Text variant="caption">Telegram ID</Text>
                  <input
                    value={newStaff.telegramId}
                    onChange={(e) => setNewStaff((p) => ({ ...p, telegramId: e.target.value }))}
                    placeholder="337367605"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <Text variant="caption">Роль</Text>
                  <select value={newStaff.staffRole} onChange={(e) => setNewStaff((p) => ({ ...p, staffRole: e.target.value }))} style={inputStyle}>
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="florist">florist</option>
                    <option value="courier">courier</option>
                  </select>
                </div>
              </div>

              <div>
                <Text variant="caption">Имя (опц.)</Text>
                <input value={newStaff.name} onChange={(e) => setNewStaff((p) => ({ ...p, name: e.target.value }))} placeholder="Имя" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Text variant="caption">Username (опц.)</Text>
                  <input value={newStaff.username} onChange={(e) => setNewStaff((p) => ({ ...p, username: e.target.value }))} placeholder="@username" style={inputStyle} />
                </div>
                <div>
                  <Text variant="caption">Телефон (опц.)</Text>
                  <input value={newStaff.phone} onChange={(e) => setNewStaff((p) => ({ ...p, phone: e.target.value }))} placeholder="+7…" style={inputStyle} />
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await adminApi.createStaff({ ...newStaff, staffActive: true });
                    setNewStaff({ telegramId: '', staffRole: 'moderator', name: '', username: '', phone: '' });
                    await load();
                  } catch (e) {
                    alert(e?.data?.error || e?.message || 'Не удалось добавить');
                  }
                }}
                style={{
                  height: 46,
                  borderRadius: 'var(--r-lg)',
                  border: 0,
                  background: 'var(--text)',
                  color: 'var(--c-white)',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                Добавить staff
              </button>
            </div>
          </Surface>

          {staff.map((u) => (
            <Surface key={u.id} variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.name || u.username || `User #${u.id}`}
                  </Text>
                  <div style={{ marginTop: 6 }}>
                    <Text variant="caption">TG ID: {u.telegramId || '—'}</Text>
                  </div>
                </div>
                <span
                  className="ui-chip"
                  style={{
                    borderColor: 'transparent',
                    background: u.staffActive ? 'var(--c-success-bg)' : 'var(--surface-2)',
                    color: u.staffActive ? 'var(--success)' : 'var(--muted)',
                  }}
                >
                  {u.staffActive ? 'ACTIVE' : 'OFF'}
                </span>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Text variant="caption">Роль</Text>
                  <select
                    value={u.staffRole || ''}
                    onChange={(e) => setStaff((prev) => prev.map((x) => (x.id === u.id ? { ...x, staffRole: e.target.value } : x)))}
                    style={inputStyle}
                  >
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="florist">florist</option>
                    <option value="courier">courier</option>
                  </select>
                </div>
                <div>
                  <Text variant="caption">Активен</Text>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, marginTop: 10 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(u.staffActive)}
                      onChange={(e) => setStaff((prev) => prev.map((x) => (x.id === u.id ? { ...x, staffActive: e.target.checked } : x)))}
                    />
                    Доступ в админку
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await adminApi.updateStaff(u.id, { staffRole: u.staffRole, staffActive: u.staffActive });
                      await load();
                    } catch (e) {
                      alert(e?.data?.error || e?.message || 'Не удалось сохранить');
                    }
                  }}
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 'var(--r-lg)',
                    border: 0,
                    background: 'var(--text)',
                    color: 'var(--c-white)',
                    cursor: 'pointer',
                    fontWeight: 900,
                  }}
                >
                  Сохранить
                </button>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
