import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, Shield, UserRound } from 'lucide-react';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

function MenuItem({ title, caption, onClick, disabled = false }) {
  return (
    <Surface
      variant="soft"
      onClick={disabled ? undefined : onClick}
      style={{
        padding: 14,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </Text>
          {caption ? (
            <div style={{ marginTop: 6 }}>
              <Text variant="caption">{caption}</Text>
            </div>
          ) : null}
        </div>
        <ChevronRight size={22} color="var(--muted)" />
      </div>
    </Surface>
  );
}

export function ProfilePage({ user, onLogout }) {
  const navigate = useNavigate();

  const meLabel = useMemo(() => {
    if (!user) return '—';
    return user?.name || user?.phone || `Сотрудник #${user?.id || ''}`;
  }, [user]);

  const roleLabel = user?.role ? String(user.role).toUpperCase() : 'STAFF';
  const isAdmin = String(user?.role || '') === 'admin';

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">Профиль</Text>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--accent)' }}>
                  <UserRound size={27} />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <Text variant="subtitle" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meLabel}
                </Text>
                <div style={{ marginTop: 6 }}>
                  <Text variant="body" muted>
                    {user?.phone || 'Телефон не указан'}
                  </Text>
                </div>
              </div>
            </div>

            <span className="ui-chip" style={{ borderColor: 'transparent', background: 'var(--surface)' }}>
              <Shield size={16} />
              <span style={{ fontSize: 12, fontWeight: 900 }}>{roleLabel}</span>
            </span>
          </div>
        </Surface>

        <MenuItem
          title="Доставка"
          caption={isAdmin ? 'Зоны на карте, тарифы и условия' : 'Доступно только admin'}
          disabled={!isAdmin}
          onClick={() => navigate('/delivery')}
        />

        <MenuItem
          title="Режим работы"
          caption={isAdmin ? 'Расписание по дням недели' : 'Доступно только admin'}
          disabled={!isAdmin}
          onClick={() => navigate('/profile/working-hours')}
        />

        <MenuItem
          title="Пользователи (staff)"
          caption={isAdmin ? 'Роли и доступы' : 'Доступно только admin'}
          disabled={!isAdmin}
          onClick={() => navigate('/profile/staff')}
        />

        <button
          type="button"
          onClick={onLogout}
          style={{ height: 50, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <LogOut size={18} />
          Выйти из кабинета
        </button>
      </div>
    </div>
  );
}
