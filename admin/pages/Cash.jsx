import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRange(fromYmd, toYmdValue) {
  const f = parseYmd(fromYmd);
  const t = parseYmd(toYmdValue);
  if (!f || !t) return '—';
  const fStr = f.toLocaleDateString('ru-RU');
  const tStr = t.toLocaleDateString('ru-RU');
  return `${fStr} → ${tStr}`;
}

function pct(n, d) {
  const num = Number(n || 0);
  const den = Number(d || 0);
  if (!den) return null;
  return (num / den) * 100;
}

function normalizeStartParam(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--c-ink-06)', margin: 'var(--sp-6) 0' }} />;
}

function Stat({ label, value, accent = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 900 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ whiteSpace: 'nowrap', color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

function Tile({ title, value, caption }) {
  return (
    <Surface variant="soft" style={{ padding: 12, borderRadius: 18, border: '1px solid var(--border)' }}>
      <Text variant="caption">{title}</Text>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 1100 }}>{value}</div>
      {caption ? (
        <div style={{ marginTop: 6 }}>
          <Text variant="caption">{caption}</Text>
        </div>
      ) : null}
    </Surface>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.32)',
          zIndex: 90,
        }}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'grid',
          placeItems: 'center',
          padding:
            'calc(var(--sp-4) + var(--app-inset-top)) calc(var(--sp-4) + var(--app-inset-right)) calc(var(--sp-4) + var(--app-inset-bottom)) calc(var(--sp-4) + var(--app-inset-left))',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: 'min(100%, var(--app-max))', pointerEvents: 'auto' }}>
          <Surface
            variant="soft"
            style={{
              padding: 16,
              borderRadius: 'var(--r-lg)',
              boxShadow: 'var(--shadow-2)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <Text variant="subtitle">{title}</Text>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 'var(--r-pill)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ marginTop: 12 }}>{children}</div>
          </Surface>
        </div>
      </div>
    </>
  );
}

export function CashPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return toYmd(d);
  });
  const [to, setTo] = useState(() => toYmd(new Date()));

  const [refTag, setRefTag] = useState('ads');
  const [refCopied, setRefCopied] = useState(false);
  const [refCreateBusy, setRefCreateBusy] = useState(false);
  const [refCreateError, setRefCreateError] = useState('');
  const [referrals, setReferrals] = useState([]);
  const [referralsError, setReferralsError] = useState('');

  const [periodOpen, setPeriodOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [finance, setFinance] = useState(null);

  const counts = summary?.counts || {};

  const conv = useMemo(() => {
    const productView = Number(counts.product_view || 0);
    const addToCart = Number(counts.add_to_cart || 0);
    const checkoutStart = Number(counts.checkout_start || 0);
    const paymentSuccess = Number(counts.payment_success || 0);

    return {
      productView,
      addToCart,
      checkoutStart,
      paymentSuccess,
      pvToCart: pct(addToCart, productView),
      cartToCheckout: pct(checkoutStart, addToCart),
      checkoutToPay: pct(paymentSuccess, checkoutStart),
    };
  }, [counts]);

  const startParam = useMemo(() => normalizeStartParam(refTag) || 'flowie', [refTag]);
  const referralLink = useMemo(
    () => `https://t.me/flowieapp_bot?startapp=${encodeURIComponent(startParam)}`,
    [startParam],
  );

  async function load() {
    setBusy(true);
    setError('');
    setReferralsError('');
    try {
      const [sRes, fRes, rRes] = await Promise.allSettled([
        adminApi.getAnalyticsSummary({ from, to }),
        adminApi.getFinance({ from, to }),
        adminApi.getReferrals({ from, to }),
      ]);

      if (sRes.status === 'fulfilled') {
        setSummary(sRes.value || null);
      } else {
        setSummary(null);
        setError(sRes.reason?.data?.error || sRes.reason?.message || 'Не удалось загрузить данные');
      }

      if (fRes.status === 'fulfilled') {
        setFinance(fRes.value || null);
      } else {
        setFinance(null);
        setError((prev) => prev || fRes.reason?.data?.error || fRes.reason?.message || 'Не удалось загрузить данные');
      }

      if (rRes.status === 'fulfilled') {
        setReferrals(rRes.value?.links || []);
      } else {
        setReferrals([]);
        setReferralsError(rRes.reason?.data?.error || rRes.reason?.message || 'Не удалось загрузить рефералы');
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyReferral() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const el = document.createElement('textarea');
        el.value = referralLink;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setRefCopied(true);
      setTimeout(() => setRefCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  async function createReferral() {
    const tag = normalizeStartParam(refTag);
    if (!tag) {
      setRefCreateError('Введите корректный тег кампании');
      return;
    }
    setRefCreateBusy(true);
    setRefCreateError('');
    try {
      await adminApi.createReferral({ tag });
      setRefTag(tag);
      const res = await adminApi.getReferrals({ from, to });
      setReferrals(res?.links || []);
      setReferralsError('');
    } catch (e) {
      setRefCreateError(e?.data?.error || e?.message || 'Не удалось сохранить ссылку');
    } finally {
      setRefCreateBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setQuick(daysBack) {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - daysBack);
    f.setHours(0, 0, 0, 0);
    setFrom(toYmd(f));
    setTo(toYmd(t));
  }

  const rangeLabel = formatRange(from, to);

  return (
    <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text variant="title">Бизнес</Text>
        <button
          type="button"
          onClick={load}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontWeight: 900 }}
        >
          Обновить
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Surface
          variant="soft"
          onClick={() => setPeriodOpen(true)}
          style={{
            padding: 14,
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <Text variant="subtitle">Период</Text>
              <div style={{ marginTop: 6 }}>
                <Text variant="caption">{rangeLabel}</Text>
              </div>
            </div>
            <span
              className="ui-chip"
              style={{ borderColor: 'transparent', background: 'var(--surface)', color: 'var(--text)', fontWeight: 1000 }}
            >
              <Calendar size={16} />
              Изменить
            </span>
          </div>
        </Surface>
      </div>

      <Divider />

      <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
        <Text variant="subtitle">Реферальные ссылки</Text>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div>
            <Text variant="caption">Тег кампании</Text>
            <input
              value={refTag}
              onChange={(e) => setRefTag(e.target.value)}
              placeholder="например: instagram_feb"
              style={{
                width: '100%',
                marginTop: 6,
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 12,
                background: 'var(--c-white)',
              }}
            />
            <div style={{ marginTop: 6 }}>
              <Text variant="caption" muted>
                Бот: @flowieapp_bot · разрешены латиница, цифры, _ и -
              </Text>
            </div>
          </div>

          <div>
            <Text variant="caption">Ссылка</Text>
            <input
              value={referralLink}
              readOnly
              onFocus={(e) => e.target.select()}
              style={{
                width: '100%',
                marginTop: 6,
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 12,
                background: 'var(--c-white)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copyReferral}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 'var(--r-pill)',
                border: 0,
                background: 'var(--text)',
                color: 'var(--c-white)',
                cursor: 'pointer',
                fontWeight: 900,
              }}
            >
              Скопировать
            </button>
            <button
              type="button"
              onClick={createReferral}
              disabled={refCreateBusy}
              style={{
                height: 38,
                padding: '0 16px',
                borderRadius: 'var(--r-pill)',
                border: '1px solid var(--border)',
                background: 'transparent',
                cursor: refCreateBusy ? 'default' : 'pointer',
                fontWeight: 900,
              }}
            >
              {refCreateBusy ? 'Сохраняем…' : 'Сохранить'}
            </button>
            {refCopied ? (
              <Text variant="caption" style={{ color: 'var(--success)' }}>
                Скопировано
              </Text>
            ) : (
              <Text variant="caption" muted>
                Открытие фиксируется и привязывается к ссылке
              </Text>
            )}
          </div>
          {refCreateError ? (
            <div style={{ marginTop: 6 }}>
              <Text variant="caption" style={{ color: '#ef4444' }}>
                {refCreateError}
              </Text>
            </div>
          ) : null}
          <div style={{ height: 1, background: 'var(--c-ink-06)', margin: 'var(--sp-6) 0 var(--sp-4)' }} />
          <Text variant="caption">Статистика по ссылкам (за период)</Text>
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {referralsError ? (
              <Text variant="caption" style={{ color: '#ef4444' }}>
                {referralsError}
              </Text>
            ) : null}
            {(referrals || []).length ? (
              (referrals || []).map((r) => (
                <Surface key={r.id} variant="soft" style={{ padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <Text variant="subtitle">{r.title || r.tag}</Text>
                    {r.autoCreated ? (
                      <span className="ui-chip" style={{ borderColor: 'transparent', background: 'var(--surface)' }}>
                        auto
                      </span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Text variant="caption">Тег</Text>
                    <div style={{ marginTop: 2, fontWeight: 900 }}>{r.tag}</div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text variant="caption">Ссылка</Text>
                    <input
                      value={`https://t.me/flowieapp_bot?startapp=${encodeURIComponent(r.tag || '')}`}
                      readOnly
                      onFocus={(e) => e.target.select()}
                      style={{
                        width: '100%',
                        marginTop: 6,
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        padding: 10,
                        background: 'var(--c-white)',
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                    <Stat label="Открытий" value={r?.stats?.opens ?? 0} />
                    <Stat label="Уникальных" value={r?.stats?.uniqueUsers ?? 0} />
                    <Stat label="Заказов" value={r?.stats?.orders ?? 0} />
                    <Stat label="Оплаченных" value={r?.stats?.paidOrders ?? 0} />
                    <Stat label="Выручка (оплачено)" value={`${r?.stats?.paidRevenue ?? 0} ₽`} accent />
                  </div>
                </Surface>
              ))
            ) : (
              <Text variant="body" muted>
                Ссылок пока нет.
              </Text>
            )}
          </div>
        </div>
      </Surface>

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
          <Divider />

          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Конверсия</Text>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Tile
                title="Товар → В корзину"
                value={conv.pvToCart == null ? '—' : `${conv.pvToCart.toFixed(0)}%`}
                caption={`${conv.addToCart} / ${conv.productView}`}
              />
              <Tile
                title="В корзину → Оформление"
                value={conv.cartToCheckout == null ? '—' : `${conv.cartToCheckout.toFixed(0)}%`}
                caption={`${conv.checkoutStart} / ${conv.addToCart}`}
              />
              <Tile
                title="Оформление → Оплата"
                value={conv.checkoutToPay == null ? '—' : `${conv.checkoutToPay.toFixed(0)}%`}
                caption={`${conv.paymentSuccess} / ${conv.checkoutStart}`}
              />
              <Tile title="Заказов (создано)" value={String(summary?.orders ?? 0)} caption={null} />
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">События</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Stat label="Главная (просмотры)" value={counts.home_view ?? 0} />
              <Stat label="Товар (просмотры)" value={counts.product_view ?? 0} />
              <Stat label="Клик по товару" value={counts.product_click ?? 0} />
              <Stat label="Добавили в корзину" value={counts.add_to_cart ?? 0} accent />
              <Stat label="Начали оформление" value={counts.checkout_start ?? 0} />
              <Stat label="Оплата успешна" value={counts.payment_success ?? 0} accent />
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Финансы</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Stat label="Выручка (delivered)" value={`${finance?.totals?.deliveredRevenue ?? 0} ₽`} accent />
              <Stat label="Выполнено" value={finance?.totals?.deliveredCount ?? 0} />
              <Stat label="Отмен" value={finance?.totals?.cancelledCount ?? 0} />
              <Stat label="Средний чек" value={`${finance?.totals?.avgCheck ?? 0} ₽`} />
              <Stat label="Средняя оценка" value={finance?.totals?.avgRating == null ? '—' : String(finance.totals.avgRating.toFixed(2))} />
            </div>

            <Divider />

            <Text variant="subtitle">Клиенты</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Stat label="База (не staff)" value={finance?.totals?.totalClients ?? 0} />
              <Stat label="Новые за период" value={finance?.totals?.newClients ?? 0} />
            </div>
          </Surface>

          <Divider />

          <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Выручка по дням</Text>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {(finance?.revenueByDay || []).length ? (
                finance.revenueByDay.map((d) => (
                  <div
                    key={d.day}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderTop: '1px solid var(--c-ink-06)',
                      paddingTop: 10,
                      fontWeight: 900,
                    }}
                  >
                    <span style={{ color: 'var(--muted)' }}>{d.day}</span>
                    <span style={{ whiteSpace: 'nowrap', color: 'var(--accent)' }}>{d.revenue} ₽</span>
                  </div>
                ))
              ) : (
                <Text variant="body" muted>
                  Нет данных за период.
                </Text>
              )}
            </div>
          </Surface>
        </>
      )}

      {periodOpen ? (
        <Modal
          title="Период"
          onClose={() => {
            setPeriodOpen(false);
          }}
        >
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              type="button"
              onClick={() => setQuick(6)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 'var(--r-pill)',
                border: 0,
                background: 'var(--surface)',
                cursor: 'pointer',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              Неделя
            </button>
            <button
              type="button"
              onClick={() => setQuick(29)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 'var(--r-pill)',
                border: 0,
                background: 'var(--surface)',
                cursor: 'pointer',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              Месяц
            </button>
            <button
              type="button"
              onClick={() => setQuick(89)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 'var(--r-pill)',
                border: 0,
                background: 'var(--surface)',
                cursor: 'pointer',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              3 месяца
            </button>
            <button
              type="button"
              onClick={() => setQuick(364)}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 'var(--r-pill)',
                border: 0,
                background: 'var(--surface)',
                cursor: 'pointer',
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              Год
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Text variant="caption">С</Text>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>
            <div>
              <Text variant="caption">По</Text>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--c-white)',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <button
              type="button"
              onClick={async () => {
                setPeriodOpen(false);
                await load();
              }}
              style={{
                height: 46,
                borderRadius: 'var(--r-lg)',
                border: 0,
                background: 'var(--text)',
                color: 'var(--c-white)',
                cursor: 'pointer',
                fontWeight: 1000,
              }}
            >
              Применить
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
