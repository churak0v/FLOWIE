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

const WEEKDAYS = [
  { key: 0, label: 'Понедельник' },
  { key: 1, label: 'Вторник' },
  { key: 2, label: 'Среда' },
  { key: 3, label: 'Четверг' },
  { key: 4, label: 'Пятница' },
  { key: 5, label: 'Суббота' },
  { key: 6, label: 'Воскресенье' },
];

function normalizeDays(days) {
  const by = new Map((days || []).map((d) => [d.weekday, d]));
  return WEEKDAYS.map((w) => {
    const row = by.get(w.key);
    return {
      weekday: w.key,
      startTime: row?.startTime || '10:00',
      endTime: row?.endTime || '20:00',
      isClosed: Boolean(row?.isClosed),
    };
  });
}

export function ProfileWorkingHoursPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [days, setDays] = useState(() => normalizeDays([]));
  const [exceptions, setExceptions] = useState([]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const wh = await adminApi.getWorkingHours();
      setDays(normalizeDays(wh?.days || []));
      setExceptions(wh?.exceptions || []);
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось загрузить режим работы');
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
        <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>Режим работы</div>
        <div />
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title" style={{ fontSize: 20 }}>
          Расписание
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
        <>
          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            {days.map((d) => (
              <Surface key={d.weekday} variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                <Text variant="subtitle">{WEEKDAYS.find((w) => w.key === d.weekday)?.label || `День ${d.weekday}`}</Text>

                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <Text variant="caption">С</Text>
                    <input
                      type="time"
                      value={d.startTime || ''}
                      disabled={d.isClosed}
                      onChange={(e) =>
                        setDays((prev) => prev.map((x) => (x.weekday === d.weekday ? { ...x, startTime: e.target.value } : x)))
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <Text variant="caption">До</Text>
                    <input
                      type="time"
                      value={d.endTime || ''}
                      disabled={d.isClosed}
                      onChange={(e) =>
                        setDays((prev) => prev.map((x) => (x.weekday === d.weekday ? { ...x, endTime: e.target.value } : x)))
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(d.isClosed)}
                      onChange={(e) =>
                        setDays((prev) => prev.map((x) => (x.weekday === d.weekday ? { ...x, isClosed: e.target.checked } : x)))
                      }
                    />
                    Выходной
                  </label>
                </div>
              </Surface>
            ))}
          </div>

          <div style={{ marginTop: 'var(--sp-6)' }}>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (saving) return;
                setSaving(true);
                try {
                  await adminApi.updateWorkingHours({ days, exceptions });
                  await load();
                  alert('Сохранено');
                } catch (e) {
                  alert(e?.data?.error || e?.message || 'Не удалось сохранить');
                } finally {
                  setSaving(false);
                }
              }}
              style={{
                width: '100%',
                height: 50,
                borderRadius: 'var(--r-lg)',
                border: 0,
                background: saving ? 'var(--c-ink-14)' : 'var(--text)',
                color: 'var(--c-white)',
                cursor: saving ? 'default' : 'pointer',
                fontWeight: 1000,
              }}
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
