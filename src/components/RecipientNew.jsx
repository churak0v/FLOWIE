import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { Surface } from './ui/Surface';
import { Text } from './ui/Text';
import { Toggle } from './ui/Toggle';

function validatePhone(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits) return true; // optional
  const normalized = digits.startsWith('+') ? digits : `+${digits}`;
  return /^\+\d{10,15}$/.test(normalized);
}

function validateBirthDate(v) {
  const s = String(v || '').trim();
  if (!s) return true; // optional
  return /^\d{2}\.\d{2}\.\d{2}$/.test(s);
}

function formatBirthDateInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 6);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yy = digits.slice(4, 6);
  let out = dd;
  if (mm) out += `.${mm}`;
  if (yy) out += `.${yy}`;
  return out;
}

export function RecipientNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, actions } = useAppState();

  const editIdRaw = searchParams.get('edit');
  const editId = editIdRaw != null ? Number(editIdRaw) : NaN;
  const editing = Number.isFinite(editId);
  const editingRecipient = editing ? state.recipients.items.find((r) => Number(r.id) === editId) || null : null;

  const inputRef = useRef(null);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [phone, setPhone] = useState('+7');
  const [address, setAddress] = useState('');
  const [askAddress, setAskAddress] = useState(false);
  const [birthDate, setBirthDate] = useState('');

  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);

  const phoneOk = useMemo(() => validatePhone(phone), [phone]);
  const birthOk = useMemo(() => validateBirthDate(birthDate), [birthDate]);
  const canSave = Boolean(name.trim()) && phoneOk && birthOk && !uploading;

  React.useEffect(() => {
    if (!editing) return;
    if (!editingRecipient) return;
    setName(editingRecipient.name || '');
    setRelation(editingRecipient.relation || '');
    setPhone(editingRecipient.phone || '+7');
    setAddress(editingRecipient.address || '');
    setAskAddress(Boolean(editingRecipient.askAddress));
    setBirthDate(editingRecipient.birthDate || '');
    setImageUrl(editingRecipient.image || '');
  }, [editing, editingRecipient]);

  React.useEffect(() => {
    if (askAddress) {
      setAddressLoading(false);
      setAddressSuggestions([]);
      return;
    }

    const q = String(address || '').trim();
    if (q.length < 4) {
      setAddressLoading(false);
      setAddressSuggestions([]);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('q', q);
        url.searchParams.set('accept-language', 'ru');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('limit', '6');

        const res = await fetch(url.toString(), {
          method: 'GET',
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP_${res.status}`);
        const data = await res.json().catch(() => null);
        const items = Array.isArray(data)
          ? data
              .map((x) => {
                const label = String(x?.display_name || '').trim();
                const id = x?.place_id ?? x?.osm_id ?? label;
                if (!label) return null;
                return { id, label };
              })
              .filter(Boolean)
          : [];
        setAddressSuggestions(items);
      } catch (e) {
        if (e?.name !== 'AbortError') setAddressSuggestions([]);
      } finally {
        if (!ctrl.signal.aborted) setAddressLoading(false);
      }
    }, 280);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [address, askAddress]);

  return (
    <AppShell style={{ '--app-shell-bottom-space': '0px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Назад">
          <ChevronLeft size={22} />
        </IconButton>
        <Text variant="title">{editing ? 'Получатель' : 'Новый получатель'}</Text>
      </div>

      <div style={{ marginTop: 'var(--sp-8)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: 108,
            height: 108,
            borderRadius: '999px',
            border: imageUrl ? '1px solid var(--border)' : '1px dashed var(--border)',
            background: 'var(--surface-2)',
            overflow: 'hidden',
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Добавить фото"
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Plus size={28} color="var(--muted)" />
          )}
        </button>
        {!imageUrl ? (
          <div style={{ marginTop: 10 }}>
            <Text variant="caption" style={{ color: 'var(--muted)' }}>
              Добавьте фото
            </Text>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setUploading(true);
              const url = await api.uploadFile(file);
              setImageUrl(url);
            } catch {
              alert('Не удалось загрузить фото');
            } finally {
              setUploading(false);
              // Allow selecting the same file again.
              e.target.value = '';
            }
          }}
        />
      </div>

      <div style={{ marginTop: 'var(--sp-8)', display: 'grid', gap: 12 }}>
        <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <Text variant="caption">Имя</Text>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например, Аделина"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>

            <div>
              <Text variant="caption">Статус</Text>
              <input
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder="Например, жена"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>

            <div>
              <Text variant="caption">Номер телефона</Text>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+79990000000"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
              {phoneOk ? null : (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption">Введите телефон в формате +79990000000</Text>
                </div>
              )}
            </div>

            <div>
              <Text variant="caption">Адрес</Text>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Например: СПб, Невский пр., 10"
                disabled={askAddress}
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: askAddress ? 'var(--surface-2)' : 'var(--c-white)',
                  opacity: askAddress ? 0.7 : 1,
                }}
              />

              {askAddress ? null : addressLoading ? (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption" style={{ color: 'var(--muted)' }}>
                    Ищем варианты…
                  </Text>
                </div>
              ) : null}

              {!askAddress && addressSuggestions.length ? (
                <div style={{ marginTop: 8 }}>
                  <Surface
                    variant="soft"
                    style={{
                      padding: 6,
                      borderRadius: 16,
                      border: '1px solid var(--border)',
                      background: 'var(--c-white)',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6 }}>
                      {addressSuggestions.slice(0, 6).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setAddress(s.label);
                            setAddressSuggestions([]);
                          }}
                          style={{
                            border: 0,
                            background: 'transparent',
                            padding: 10,
                            borderRadius: 12,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <Text variant="body">{s.label}</Text>
                        </button>
                      ))}
                    </div>
                  </Surface>
                </div>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <Toggle
                  checked={askAddress}
                  onChange={(next) => {
                    const v = Boolean(next);
                    setAskAddress(v);
                    if (v) {
                      setAddress('');
                      setAddressSuggestions([]);
                      setAddressLoading(false);
                    }
                  }}
                  label="Узнавать у получателя"
                />
              </div>
            </div>

            <div>
              <Text variant="caption">Дата рождения</Text>
              <input
                value={birthDate}
                onChange={(e) => setBirthDate(formatBirthDateInput(e.target.value))}
                placeholder="__.__.__"
                inputMode="numeric"
                style={{
                  marginTop: 6,
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
              {birthOk ? null : (
                <div style={{ marginTop: 6 }}>
                  <Text variant="caption">Введите в формате дд.мм.гг</Text>
                </div>
              )}
            </div>
          </div>
        </Surface>

        <button
          type="button"
          disabled={!canSave}
          onClick={async () => {
            if (!canSave) return;
            try {
              const payload = {
                name,
                relation,
                phone,
                address,
                askAddress,
                birthDate,
                image: imageUrl,
              };

              if (editing && editingRecipient) {
                await actions.updateRecipient(editingRecipient.id, payload);
              } else {
                await actions.addRecipient(payload);
              }
              navigate(-1);
            } catch (e) {
              alert(e?.data?.error || e?.message || 'Не удалось сохранить');
            }
          }}
          style={{
            height: 54,
            borderRadius: 'var(--r-lg)',
            border: 0,
            background: canSave ? 'var(--accent)' : 'var(--c-ink-14)',
            color: 'var(--c-white)',
            fontWeight: 1000,
            cursor: canSave ? 'pointer' : 'default',
          }}
        >
          {uploading ? 'Загружаем…' : 'Сохранить'}
        </button>

        {editing && editingRecipient ? (
          <button
            type="button"
            onClick={async () => {
              const ok = confirm('Удалить профиль получателя?');
              if (!ok) return;
              try {
                await actions.removeRecipient(editingRecipient.id);
                navigate('/recipients');
              } catch (e) {
                const code = e?.data?.error || e?.message || '';
                if (code === 'ACTIVE_ORDERS') {
                  alert('Нельзя удалить профиль, пока есть активные обязательства (подписка/заказы).');
                } else {
                  alert(code || 'Не удалось удалить профиль');
                }
              }
            }}
            style={{
              marginTop: 10,
              height: 54,
              borderRadius: 'var(--r-lg)',
              border: '1px solid rgba(255,0,0,0.25)',
              background: 'rgba(255,0,0,0.06)',
              color: '#b10000',
              fontWeight: 1000,
              cursor: 'pointer',
            }}
          >
            Удалить профиль
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}
