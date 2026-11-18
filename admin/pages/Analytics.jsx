import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../lib/adminApi';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

const rub = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });

function Card({ title, value, caption }) {
  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
      <Text variant="caption">{title}</Text>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 1000 }}>{value}</div>
      {caption ? <div style={{ marginTop: 6 }}><Text variant="caption" muted>{caption}</Text></div> : null}
    </Surface>
  );
}

function Section({ title, note, children }) {
  return (
    <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
      <Text variant="subtitle">{title}</Text>
      {note ? <div style={{ marginTop: 6 }}><Text variant="caption" muted>{note}</Text></div> : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </Surface>
  );
}

function Rows({ rows, render }) {
  if (!rows?.length) return <Text variant="body" muted>За выбранный период данных нет.</Text>;
  return <div style={{ display: 'grid', gap: 10 }}>{rows.map(render)}</div>;
}

function Line({ label, values }) {
  return (
    <div style={{ borderTop: '1px solid var(--c-ink-06)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label}</span>
      <span style={{ whiteSpace: 'nowrap', fontWeight: 900 }}>{values}</span>
    </div>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError('');
    adminApi.getAnalyticsReport(days)
      .then((value) => { if (alive) setReport(value); })
      .catch((e) => { if (alive) { setReport(null); setError(e?.data?.error || e?.message || 'Не удалось загрузить отчёт'); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [days]);

  return (
    <div style={{ paddingBottom: 0, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <Text variant="title">Отчёты</Text>
          <div style={{ marginTop: 4 }}><Text variant="caption" muted>ООО «ЦВЕТОЧНОЕ РЕШЕНИЕ»</Text></div>
        </div>
        <Link to="/cash" style={{ color: 'var(--muted)', fontWeight: 900 }}>Бизнес</Link>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[7, 30].map((value) => (
          <button key={value} type="button" onClick={() => setDays(value)} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-pill)', padding: '8px 16px', background: days === value ? 'var(--text)' : 'var(--surface)', color: days === value ? 'var(--c-white)' : 'var(--text)', fontWeight: 900, cursor: 'pointer' }}>
            {value} дней
          </button>
        ))}
      </div>

      {busy ? <Section title="Загружаем отчёт…"><Text variant="body" muted>Собираем только данные выбранного периода.</Text></Section> : null}
      {error ? <Section title="Ошибка"><Text variant="body" style={{ color: '#ef4444' }}>{error}</Text></Section> : null}

      {!busy && report ? (
        <>
          {report.dataQuality?.eventsTruncated ? (
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid #f59e0b' }}>
              <Text variant="body">Событий больше лимита отчёта; событийные метрики неполные. Финансы из заказов остаются полными.</Text>
            </Surface>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Card title="Визиты" value={report.traffic?.visits ?? 0} caption="События page_view" />
            <Card title="Известные сессии" value={report.traffic?.uniqueKnownSessions ?? 0} caption={`Без sessionId: ${report.traffic?.visitsWithoutSession ?? 0} визитов`} />
            <Card title="Подтверждённые заказы" value={report.funnel?.confirmedOrders ?? 0} caption="Order.paymentStatus = CONFIRMED" />
            <Card title="Основная выручка" value={rub.format(report.funnel?.confirmedRevenue ?? 0)} caption="Order.paidAt за период" />
            <Card title="Доплаты доставки" value={rub.format(report.funnel?.confirmedDeliveryRevenue ?? 0)} caption={`${report.funnel?.confirmedDeliveryPayments ?? 0} оплаченных отдельных счетов`} />
            <Card title="Всего поступлений" value={rub.format(report.funnel?.totalConfirmedReceipts ?? 0)} caption="Основной счёт + отдельные доплаты" />
          </div>

          <Section title="Воронка" note="События и сессионные когорты показаны отдельно. Это не конверсия пользователей и не проценты.">
            <Rows rows={report.funnel?.stages} render={(row) => <Line key={row.event} label={row.label} values={`${row.eventCount} событий · ${row.knownSessionCohort} сессий`} />} />
            <div style={{ marginTop: 12 }}><Text variant="caption" muted>Серверные события: создано заказов — {report.funnel?.serverOrderCreatedEvents ?? 0}; успешных оплат — {report.funnel?.serverPaymentSuccessEvents ?? 0}. Финансовый итог выше всегда берётся из Order.</Text></div>
          </Section>

          <Section title="Популярные товары" note="Просмотры, добавления в избранное и корзину — количества действий, не уникальные люди.">
            <Rows rows={report.products} render={(row) => <Line key={row.productId} label={row.name} values={`${row.views} · ♡ ${row.favoriteAdds} · корзина ${row.cartAdds}`} />} />
          </Section>

          <Section title="Поиск" note={`Всего запросов: ${report.searchTotals?.events ?? 0}; без результатов: ${report.searchTotals?.emptyResults ?? 0}.`}>
            <Rows rows={report.searches} render={(row) => <Line key={row.query} label={row.query === 'unknown' ? 'Без распознанного запроса' : row.query} values={`${row.count} · пустых ${row.emptyResults}`} />} />
          </Section>

          <Section title="Источники визитов" note="UTM-источник относится к page_view. Оплату он сам по себе не доказывает.">
            <Rows rows={report.sources} render={(row) => <Line key={row.source} label={row.source} values={`${row.count} визитов · ${row.sessions} сессий`} />} />
          </Section>

          <Section title="Доказанная атрибуция оплат" note="Только сохранённая связь Order.referralLinkId. Всё остальное остаётся unknown.">
            <Rows rows={report.paidAttribution?.provenReferralLinks} render={(row) => <Line key={row.tag} label={row.tag} values={`${row.orders} · ${rub.format(row.revenue)}`} />} />
            <div style={{ marginTop: 12 }}><Line label="unknown" values={`${report.paidAttribution?.unknown?.orders ?? 0} · ${rub.format(report.paidAttribution?.unknown?.revenue ?? 0)}`} /></div>
          </Section>

          <Section title="Ошибки оформления" note="Только безопасные коды errorCode/code; тексты, stack trace и персональные данные не читаются.">
            <Rows rows={report.checkoutErrors} render={(row) => <Line key={row.code} label={row.code} values={row.count} />} />
          </Section>

          <Section title="Как читать отчёт">
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.values(report.definitions || {}).map((definition) => <Text key={definition} variant="caption" muted>• {definition}</Text>)}
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
