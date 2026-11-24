import { CalendarDays, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackAnalytics } from '../../lib/analytics';
import { MOTHERS_DAY_CATALOG_HREF } from '../../lib/mothersDayCampaign';

export function MothersDayPreorder({ compact = false }) {
  return (
    <section
      aria-labelledby="mothers-day-preorder-title"
      style={{
        padding: compact ? 14 : 16,
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--c-accent-border)',
        background: 'linear-gradient(135deg, var(--c-accent-10), var(--surface))',
        boxShadow: compact ? 'none' : 'var(--shadow-1)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: 'var(--surface)',
            color: 'var(--accent)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <CalendarDays size={21} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 1000, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            День матери · 29 ноября
          </div>
          <h2 id="mothers-day-preorder-title" style={{ margin: '5px 0 0', fontSize: compact ? 18 : 20, lineHeight: 1.12 }}>
            Предзаказ на воскресенье
          </h2>
          <p style={{ margin: '7px 0 0', color: 'var(--muted)', fontSize: 14, lineHeight: 1.35 }}>
            Выберите букет из актуального каталога. Дату 29 ноября и удобный интервал можно указать при оформлении.
          </p>
        </div>
      </div>

      {compact ? null : (
        <Link
          to={MOTHERS_DAY_CATALOG_HREF}
          onClick={() => trackAnalytics('home_banner_click', { meta: { bannerId: 'mothers-day-2026-home-cta' } })}
          style={{
            marginTop: 14,
            minHeight: 50,
            borderRadius: 15,
            background: 'var(--accent)',
            color: 'var(--c-accent-contrast)',
            textDecoration: 'none',
            fontWeight: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          Выбрать букет
          <ChevronRight size={19} strokeWidth={3} />
        </Link>
      )}
    </section>
  );
}
