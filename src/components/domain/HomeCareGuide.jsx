import { ArrowUpRight, Droplets } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../state/AppState';
import { trackAnalytics } from '../../lib/analytics';
import { AppImage } from '../ui/AppImage';

export function HomeCareGuide() {
  const navigate = useNavigate();
  const { state } = useAppState();
  const image = state.products.items.find((product) => product?.image)?.image;
  const openGuide = () => {
    trackAnalytics('element_click', { meta: { elementKey: 'care_guide', placementKey: 'home_recommendations' } });
    navigate('/care');
  };

  return (
    <section style={{ marginTop: 30 }}>
      <button type="button" onClick={openGuide} aria-label="Открыть гид по уходу за цветами" style={{ position: 'relative', width: '100%', minHeight: 250, overflow: 'hidden', padding: 0, border: 0, borderRadius: 28, background: '#492a35', color: '#fff', textAlign: 'left', cursor: 'pointer', boxShadow: '0 22px 52px rgba(70, 34, 46, 0.2)' }}>
        {image ? <AppImage src={image} alt="" loading="lazy" variant="card" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, rgba(52,22,31,.93) 5%, rgba(52,22,31,.66) 58%, rgba(52,22,31,.18))' }} />
        <span style={{ position: 'relative', zIndex: 1, minHeight: 250, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(10px)' }}><Droplets size={22} /></span>
          <span style={{ marginTop: 'auto', maxWidth: 310, fontSize: 30, lineHeight: 1.02, fontWeight: 1000 }}>Как сохранить букет красивым</span>
          <span style={{ marginTop: 10, maxWidth: 340, fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,.82)' }}>Сколько воды налить, когда обновить срез и как ухаживать за цветами в коробке.</span>
          <span style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 950 }}>Открыть гид <ArrowUpRight size={18} /></span>
        </span>
      </button>
    </section>
  );
}
