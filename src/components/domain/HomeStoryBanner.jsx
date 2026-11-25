import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppImage } from '../ui/AppImage';
import { trackAnalytics } from '../../lib/analytics';

const panel = { background: '#fff', borderRadius: 15, padding: 7, boxShadow: '0 12px 30px #4f183226', minWidth: 0 };
const photo = { display: 'block', width: '100%', objectFit: 'cover', borderRadius: 10 };

export function HomeStoryBanner({ bannerId, eyebrow, title, text, image, product, href = '/catalog' }) {
  const isPhotoStory = bannerId === 'home-photo-proof';
  if (!image && !isPhotoStory) return null;
  return (
    <Link data-analytics-impression="banner" data-analytics-banner={bannerId} data-analytics-placement="home_recommendations" to={href} onClick={() => trackAnalytics('home_banner_click', { meta: { bannerId } })}
      style={{ position: 'relative', marginTop: 30, borderRadius: 25, overflow: 'hidden', display: 'block', color: '#51273a', textDecoration: 'none', background: '#f6dfe5' }}>
      <img src="/banners/review/paper-ribbon-background.webp" alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'relative', padding: '23px 21px 21px' }}>
        <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: '.09em', textTransform: 'uppercase' }}>{eyebrow}</div>
        <h2 style={{ margin: '9px 0', maxWidth: 280, fontSize: 30, fontWeight: 900, lineHeight: 1.04, letterSpacing: '-.035em' }}>{title}</h2>
        <p style={{ margin: 0, maxWidth: 275, fontSize: 14, lineHeight: 1.4 }}>{text}</p>
        {isPhotoStory ? (
          <div aria-label="Букет в карточке и готовый букет перед доставкой" style={{ display: 'grid', gridTemplateColumns: '1fr 1.12fr', gap: 12, alignItems: 'center', margin: '22px 0 16px' }}>
            <div style={{ ...panel, transform: 'rotate(-5deg)' }}>
              <picture>
                <source type="image/avif" srcSet="/banners/review/photo-proof-card-640.avif" />
                <img src="/banners/review/photo-proof-card-640.webp" alt="Букет на фотографии в карточке" loading="lazy" decoding="async" style={{ ...photo, aspectRatio: '1 / 1.12' }} />
              </picture>
              <div style={{ padding: '8px 3px 3px', fontSize: 12, fontWeight: 800 }}>В карточке</div>
            </div>
            <div style={{ ...panel, transform: 'rotate(5deg)' }}>
              <picture>
                <source type="image/avif" srcSet="/banners/review/photo-proof-delivery-640.avif" />
                <img src="/banners/review/photo-proof-delivery-640.webp" alt="Готовый букет перед доставкой" loading="lazy" decoding="async" style={{ ...photo, aspectRatio: '1 / 1.12' }} />
              </picture>
              <div style={{ padding: '8px 3px 3px', fontSize: 12, fontWeight: 800 }}>Перед доставкой</div>
            </div>
          </div>
        ) : (
          <div style={{ ...panel, display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: 13, alignItems: 'center', margin: '19px 0 16px', transform: 'rotate(-2deg)' }}>
            <AppImage src={image} alt={product?.name || product?.title || 'Букет из каталога FLOWIE'} variant="card" loading="lazy" style={{ ...photo, aspectRatio: '1 / 1' }} />
            <div style={{ paddingRight: 9 }}>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{product?.name || product?.title || 'Букет из каталога'}</div>
              {Number.isFinite(Number(product?.price)) ? <div style={{ marginTop: 9, color: 'var(--accent)', fontSize: 20, fontWeight: 900 }}>{Number(product.price).toLocaleString('ru-RU')} ₽</div> : null}
            </div>
          </div>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '11px 15px', borderRadius: 99, background: '#fff', fontSize: 13, fontWeight: 850 }}>Выбрать букет <ArrowUpRight size={17} /></span>
      </div>
    </Link>
  );
}
