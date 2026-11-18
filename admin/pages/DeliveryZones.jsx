import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, ChevronLeft } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { api } from '../../src/api';
import { DeliveryZoneMap } from '../components/DeliveryZoneMap';
import { formatMoney } from '../../src/lib/money';
const field = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 12, padding: 12, font: 'inherit', color: 'var(--text)', background: 'var(--surface)' };
const panel = { padding: 16, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)' };
const primary = { ...field, border: 0, background: 'var(--accent)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const messages = {
  ZONE_NAME_INVALID: 'Укажите название до 80 символов; условия — до 500 символов.',
  ZONE_PRICE_INVALID: 'Введите целую стоимость доставки от 0 до 100 000 ₽.',
  ZONE_PRICE_REQUIRED: 'Для включения зоны укажите стоимость доставки.',
  ZONE_POLYGON_INVALID: 'Обведите границу минимум тремя точками. Пустую границу можно сохранить только в черновике.',
  ZONE_POLYGON_INTERSECTS: 'Граница пересекает сама себя. Переставьте точки на карте.',
  ZONE_PRIORITY_INVALID: 'Порядок применения должен быть целым числом от 0 до 1000.',
};
function emptyZone() { return { name: '', price: '', conditions: '', priority: 100, active: false, polygon: [] }; }
export function DeliveryZonesPage() {
  const [zones, setZones] = useState([]);
  const [mode, setMode] = useState('flat');
  const [config, setConfig] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function refresh() { const result = await adminApi.getDeliveryZones(); setZones(result.zones || []); setMode(result.mode || 'flat'); }
  useEffect(() => {
    let alive = true;
    Promise.all([adminApi.getDeliveryZones(), api.getDeliveryMapConfig()]).then(([result, map]) => {
      if (alive) { setZones(result.zones || []); setMode(result.mode || 'flat'); setConfig(map); }
    }).catch(() => { if (alive) setError('Не удалось загрузить настройки доставки. Обновите страницу.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  function edit(zone) { setEditing(zone ? { ...zone, price: zone.price ?? '' } : emptyZone()); setEditorKey(v => v + 1); setError(''); setNotice(''); }
  function patch(values) { setEditing(current => ({ ...current, ...values })); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const { name, price, conditions, priority, active, polygon } = editing;
    try {
      await adminApi.saveDeliveryZone(editing.id, { name, price: price === '' ? null : Number(price), conditions, priority: Number(priority), active, polygon });
      await refresh(); setEditing(null); setNotice(active ? 'Зона сохранена и включена. Тариф применяется, когда выбран расчёт по зонам.' : 'Черновик зоны сохранён.');
    } catch (e) { setError(messages[e?.data?.error] || 'Не удалось сохранить зону. Проверьте данные и попробуйте снова.'); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm(`Удалить зону «${editing.name}»? В режиме расчёта по зонам без включённых зон доставка будет недоступна.`)) return;
    setSaving(true); setError('');
    try { await adminApi.deleteDeliveryZone(editing.id); await refresh(); setEditing(null); setNotice('Зона удалена.'); }
    catch { setError('Не удалось удалить зону.'); }
    finally { setSaving(false); }
  }
  async function changeMode(next) {
    setSaving(true); setError('');
    try { await adminApi.setDeliveryMode(next); setMode(next); setNotice(next === 'zones' ? 'Расчёт по зонам включён.' : 'Включён единый тариф. Зоны сохранены.'); }
    catch (e) { setError(e?.data?.error === 'DELIVERY_ZONES_NOT_ACTIVE' ? 'Сначала создайте и включите хотя бы одну зону.' : 'Не удалось изменить режим расчёта.'); }
    finally { setSaving(false); }
  }
  return <div style={{ paddingBottom: 24, display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Link to="/profile" aria-label="Назад в профиль" style={{ color: 'var(--text)' }}><ChevronLeft /></Link>
      <h1 style={{ margin: 0, fontSize: 24 }}>Доставка</h1>
    </div>
    <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.45 }}>Зоны и тарифы для Ижевска и пригорода. Цена определяется по адресу дома; адрес можно уточнить у получателя и выставить доставку отдельно.</p>
    {!loading && !config?.geocodeEnabled ? <div style={{ ...panel, fontSize: 14, lineHeight: 1.45 }}>Для автоматического расчёта по зонам нужно подключить Геокодер Яндекса. Без него можно подготовить черновики, но стоимость по адресу рассчитываться не будет.</div> : null}
    {notice ? <div role="status" style={panel}>{notice}</div> : null}
    {error ? <div role="alert" style={{ ...panel, color: '#b42318' }}>{error}</div> : null}
    {!loading && !editing ? <section style={{ ...panel, display: 'grid', gap: 10 }} aria-label="Режим расчёта доставки">
      <strong>Как рассчитывать доставку</strong>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={saving || mode === 'flat'} onClick={() => changeMode('flat')} style={mode === 'flat' ? primary : field}>Единый тариф</button>
        <button type="button" disabled={saving || mode === 'zones'} onClick={() => changeMode('zones')} style={mode === 'zones' ? primary : field}>По зонам</button>
      </div>
      <small style={{ color: 'var(--muted)' }}>{mode === 'flat' ? 'Используется единый тариф сервера, если он задан. Черновики и включённые зоны не влияют на заказы до переключения режима.' : 'Цена определяется включёнными зонами. Вне зон и при отсутствии включённых зон авторасчёт недоступен.'}</small>
    </section> : null}
    {loading ? <p>Загружаем зоны…</p> : editing ? <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 19 }}>{editing.id ? 'Настройка зоны' : 'Новая зона'}</h2>
      <label>Название<input required maxLength={80} aria-label="Название зоны" value={editing.name} onChange={e => patch({ name: e.target.value })} placeholder="Например, центр Ижевска" style={field} /></label>
      <DeliveryZoneMap key={editorKey} config={config} initialPolygon={editing.polygon} zones={zones} zoneId={editing.id} onChange={polygon => patch({ polygon })} />
      <small style={{ color: 'var(--muted)' }}>Точек границы: {editing.polygon.length}</small>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>Стоимость, ₽<input type="number" min="0" max="100000" step="1" aria-label="Стоимость доставки" value={editing.price} onChange={e => patch({ price: e.target.value })} placeholder="Не задана" style={field} /></label>
        <label>Порядок применения<input type="number" min="0" max="1000" step="1" aria-label="Порядок применения" value={editing.priority} onChange={e => patch({ priority: e.target.value })} style={field} /></label>
      </div>
      <small style={{ color: 'var(--muted)' }}>Если зоны пересекаются, применяется зона с меньшим номером. При одинаковом номере — созданная раньше. Нулевая стоимость означает бесплатную доставку.</small>
      <label>Условия и сроки<textarea maxLength={500} rows={3} aria-label="Условия доставки" value={editing.conditions} onChange={e => patch({ conditions: e.target.value })} placeholder="Время доставки, ограничения, примечания" style={field} /></label>
      <label style={{ ...panel, display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={editing.active} onChange={e => patch({ active: e.target.checked })} />Включить зону для заказов</label>
      <button type="submit" disabled={saving} style={primary}>{saving ? 'Сохраняем…' : 'Сохранить зону'}</button>
      <button type="button" disabled={saving} onClick={() => setEditing(null)} style={field}>Отмена</button>
      {editing.id ? <button type="button" disabled={saving} onClick={remove} style={{ ...field, color: '#b42318' }}>Удалить зону</button> : null}
    </form> : <>
      <button type="button" onClick={() => edit(null)} style={{ ...primary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Plus size={18} />Добавить зону</button>
      {!zones.length ? <div style={{ ...panel, textAlign: 'center', padding: 26 }}><MapPin size={28} /><h2 style={{ fontSize: 18 }}>Зоны пока не созданы</h2><p style={{ color: 'var(--muted)', marginBottom: 0 }}>Добавьте зону, обведите её границу на карте и задайте тариф. Черновики не меняют расчёт. Когда зоны готовы, переключите режим на «По зонам».</p></div> : zones.map(zone => <button key={zone.id} type="button" onClick={() => edit(zone)} style={{ ...panel, textAlign: 'left', color: 'var(--text)', cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 17, fontWeight: 800 }}><span>{zone.name}</span><span style={{ whiteSpace: 'nowrap' }}>{zone.price == null ? 'Без тарифа' : formatMoney(zone.price)}</span></div>
        <div style={{ color: 'var(--muted)', marginTop: 7 }}>{zone.active ? 'Включена' : 'Черновик / выключена'} · Порядок {zone.priority}</div>
        {zone.conditions ? <p style={{ marginBottom: 0 }}>{zone.conditions}</p> : null}
      </button>)}
      {zones.length > 0 ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>В режиме «По зонам» за пределами включённых зон автоматический расчёт недоступен. Выключение всех зон приостанавливает этот расчёт.</p> : null}
    </>}
  </div>;
}
