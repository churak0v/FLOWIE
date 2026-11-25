import { Camera, ChevronRight, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trackAnalytics } from '../../lib/analytics';

export function MothersDayPickerPromo() {
  const navigate = useNavigate();
  const location = useLocation();
  const openPicker = () => {
    trackAnalytics('gift_picker_view', { meta: { source: 'fallback' } }, { firstPartyOnly: true, dedupeKey: 'landing-promo' });
    navigate(`/mothers-day/picker${location.search || ''}`);
  };

  return (
    <section style={{ padding: '22px calc(16px + var(--app-inset-right)) 0 calc(16px + var(--app-inset-left))' }}>
      <div style={{ padding: 18, borderRadius: 22, background: 'linear-gradient(145deg, var(--c-accent-10), var(--surface))', border: '1px solid var(--c-accent-border)', boxShadow: '0 14px 34px rgba(70, 30, 45, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 15, background: 'var(--accent)', color: 'var(--c-accent-contrast)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Camera size={22} /></span>
          <div>
            <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.08 }}>Подберём букет по фото</h2>
            <p style={{ margin: '7px 0 0', color: 'var(--muted)', fontSize: 14, lineHeight: 1.4 }}>До 6 вариантов в разных ценах — по цветам снимка или выбранному вами стилю.</p>
          </div>
        </div>
        <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}><ShieldCheck size={16} /> Фото удаляется сразу после обработки</div>
        <button type="button" onClick={openPicker} style={{ width: '100%', minHeight: 50, marginTop: 15, padding: '0 16px', border: 0, borderRadius: 15, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          Подобрать <ChevronRight size={19} />
        </button>
      </div>
    </section>
  );
}
