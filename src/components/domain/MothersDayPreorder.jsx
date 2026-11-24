import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackAnalytics } from '../../lib/analytics';
import { MOTHERS_DAY_CATALOG_HREF } from '../../lib/mothersDayCampaign';
import { AppImage } from '../ui/AppImage';

export function MothersDayPreorder({ compact = false, image = '', imagePosition = 'center 40%' }) {
  return (
    <section
      aria-labelledby="mothers-day-preorder-title"
      style={{
        position: 'relative',
        minHeight: compact ? 132 : 190,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #6f3347, #291d25 72%)',
        boxShadow: compact ? 'none' : 'var(--shadow-1)',
      }}
    >
      {image ? (
        <AppImage
          src={image}
          alt=""
          aria-hidden="true"
          variant="tile"
          sizes="(max-width: 600px) calc(100vw - 32px), 600px"
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: imagePosition }}
        />
      ) : null}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(31,15,23,0.88), rgba(31,15,23,0.54) 68%, rgba(31,15,23,0.24))' }} />

      <div style={{ position: 'relative', zIndex: 1, minHeight: compact ? 132 : 190, padding: compact ? 15 : 18, boxSizing: 'border-box', color: 'var(--c-white)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
        <span style={{ minHeight: 28, padding: '0 10px', borderRadius: 999, background: 'rgba(255,255,255,0.88)', color: '#512236', display: 'inline-flex', alignItems: 'center', fontSize: 12, fontWeight: 1000 }}>
          Предзаказ · 29 ноября
        </span>
        <h2 id="mothers-day-preorder-title" style={{ margin: '8px 0 0', maxWidth: 290, fontSize: compact ? 20 : 25, lineHeight: 1.04, textShadow: '0 2px 12px rgba(0,0,0,0.28)' }}>
          Букет для мамы — заранее
        </h2>

        {compact ? (
          <span style={{ marginTop: 7, fontSize: 13, fontWeight: 850, opacity: 0.94 }}>Выберите букет ниже · дату укажете при оформлении</span>
        ) : (
          <Link
            to={MOTHERS_DAY_CATALOG_HREF}
            state={{ campaignImage: image || '', campaignImagePosition: imagePosition }}
            aria-label="Выбрать букет с доставкой ко Дню матери 29 ноября"
            onClick={() => trackAnalytics('home_banner_click', { meta: { bannerId: 'mothers-day-2026-home-cta' } })}
            style={{ marginTop: 13, minHeight: 44, padding: '0 15px', borderRadius: 13, background: 'var(--c-white)', color: '#512236', textDecoration: 'none', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          >
            Выбрать букет
            <ChevronRight size={18} strokeWidth={3} />
          </Link>
        )}
      </div>
    </section>
  );
}
