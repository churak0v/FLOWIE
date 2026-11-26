import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import { REGISTRATION_GIFT_DWELL_MS, shouldShowRegistrationGift, shouldShowRegistrationGiftAccountStatus } from '../../lib/registrationGift';
import { Text } from '../ui/Text';
import { AppImage } from '../ui/AppImage';

export const RegistrationGiftOffer = forwardRef(function RegistrationGiftOffer({ status, user, placement, onExpose, onLogin, onRefresh }, ref) {
  const rootRef = useRef(null);
  const exposurePromiseRef = useRef(null);
  const campaignId = String(status?.campaign?.id || '');
  const campaignIdRef = useRef(campaignId);
  const [exposurePhase, setExposurePhase] = useState(status?.exposed ? 'saved' : 'idle');

  useEffect(() => {
    if (campaignIdRef.current !== campaignId) {
      campaignIdRef.current = campaignId;
      exposurePromiseRef.current = null;
      setExposurePhase(status?.exposed ? 'saved' : 'idle');
      return;
    }
    if (status?.exposed) setExposurePhase('saved');
  }, [campaignId, status?.exposed]);

  const ensureExposure = useCallback(() => {
    if (status?.exposed || exposurePhase === 'saved') return Promise.resolve(true);
    if (exposurePromiseRef.current) return exposurePromiseRef.current;
    if (typeof onExpose !== 'function') {
      setExposurePhase('error');
      return Promise.resolve(false);
    }

    setExposurePhase('saving');
    const requestedCampaignId = campaignId;
    const request = Promise.resolve()
      .then(() => onExpose({ placement }))
      .then(() => {
        if (campaignIdRef.current !== requestedCampaignId) return false;
        setExposurePhase('saved');
        return true;
      })
      .catch(() => {
        if (campaignIdRef.current === requestedCampaignId) setExposurePhase('error');
        return false;
      })
      .finally(() => {
        if (exposurePromiseRef.current === request) exposurePromiseRef.current = null;
      });
    exposurePromiseRef.current = request;
    return request;
  }, [campaignId, exposurePhase, onExpose, placement, status?.exposed]);

  useEffect(() => {
    if (!shouldShowRegistrationGift(status) || status.exposed || exposurePhase !== 'idle') return undefined;
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver !== 'function') return undefined;

    let dwellTimer = 0;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (!visible) {
        window.clearTimeout(dwellTimer);
        dwellTimer = 0;
        return;
      }
      if (dwellTimer) return;
      dwellTimer = window.setTimeout(() => {
        ensureExposure().then(() => {
          observer.disconnect();
        });
      }, REGISTRATION_GIFT_DWELL_MS);
    }, { threshold: [0.5] });

    observer.observe(node);
    return () => {
      window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [ensureExposure, exposurePhase, status]);

  const isHome = placement === 'home';
  const illustrated = isHome || placement === 'product_details';
  const title = illustrated ? 'Raffaello в подарок' : status.campaign?.title || 'Raffaello к первому заказу';
  const body = illustrated ? '150 г к первому заказу за регистрацию' : status.campaign?.body || 'Зарегистрируйтесь, и мы добавим подарок к заказу.';
  const condition = 'К первому заказу за регистрацию.';
  const bodyLower = body.toLocaleLowerCase('ru-RU');
  const bodyHasCondition = bodyLower.includes('первому заказ') && bodyLower.includes('регистрац');
  const ctaLabel = exposurePhase === 'error'
    ? 'Повторить и зарегистрироваться'
    : isHome ? 'Получить подарок' : status.campaign?.ctaLabel || (user?.phoneVerified ? 'Проверить статус' : 'Зарегистрироваться');

  const activate = useCallback(async () => {
    if (user?.phoneVerified) {
      onRefresh?.();
      return;
    }
    const recorded = await ensureExposure();
    if (recorded) onLogin?.();
  }, [ensureExposure, onLogin, onRefresh, user?.phoneVerified]);

  useImperativeHandle(ref, () => ({ activate, ensureExposure }), [activate, ensureExposure]);

  if (!shouldShowRegistrationGift(status)) return null;

  return (
    <section ref={rootRef} aria-label={title} data-analytics-impression={isHome ? 'banner' : undefined} data-analytics-banner={isHome ? 'home-raffaello-gift-content' : undefined} data-analytics-placement={isHome ? 'home_recommendations' : undefined} style={{ marginTop: 20 }}>
      <button
        type="button"
        onClick={activate}
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: illustrated ? 'minmax(0, 1fr) minmax(80px, 32%)' : '48px minmax(0, 1fr)',
          gap: illustrated ? 18 : 12,
          alignItems: 'center',
          minHeight: illustrated ? 208 : undefined,
          padding: illustrated ? 20 : 14,
          border: illustrated ? '1px solid rgba(57, 37, 31, 0.12)' : '1px solid var(--border)',
          borderRadius: illustrated ? 24 : 20,
          backgroundColor: illustrated ? '#ead7c7' : 'var(--c-accent-06, #fff7fa)',

          backgroundSize: illustrated ? 'cover' : undefined,
          backgroundPosition: illustrated ? 'center' : undefined,
          color: illustrated ? '#2b1d1a' : 'var(--c-ink-92)',
          textAlign: 'left',
          cursor: 'pointer',
          opacity: exposurePhase === 'saving' ? 0.72 : 1,
        }}
      >
        {illustrated ? <>
          <AppImage src="/banners/raffaello-gift-v1.webp" alt="" variant="hero" loading="lazy" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} />
          <span aria-hidden="true" style={{position:'absolute',inset:0,background:'linear-gradient(90deg, rgba(255,248,240,.98) 0%, rgba(255,248,240,.88) 48%, rgba(255,248,240,.10) 76%)'}} />
        </> : null}
        {illustrated ? <span aria-hidden="true" style={{ gridColumn: 2, gridRow: 1 }} /> : (
          <span aria-hidden="true" style={{ gridColumn: 1, gridRow: 1, width: 48, height: 48, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--accent)' }}>
            <Gift size={23} strokeWidth={2.2} />
          </span>
        )}
        <span style={{ position: 'relative', gridColumn: illustrated ? 1 : 2, gridRow: 1, minWidth: 0 }}>
          {illustrated ? <Text variant="caption" style={{ marginBottom: 5, color: '#8a5a4c', fontWeight: 850 }}>Подарок за регистрацию</Text> : null}
          <Text variant={illustrated ? 'title' : 'subtitle'} style={illustrated ? { color: '#2b1d1a', fontSize: 24, fontWeight: 850, lineHeight: 1.08 } : undefined}>{title}</Text>
          <Text variant="caption" style={{ marginTop: 5, color: illustrated ? '#513b35' : 'var(--c-text-muted)', fontSize: illustrated ? 13 : 11, lineHeight: 1.4 }}>{body}</Text>
          {bodyHasCondition ? null : <Text variant="caption" style={{ marginTop: 3, color: illustrated ? '#513b35' : 'var(--c-text-muted)', fontWeight: 750 }}>{condition}</Text>}
          <span style={{ marginTop: 12, minHeight: 38, padding: '0 14px', borderRadius: 999, background: illustrated ? 'rgba(255,255,255,0.92)' : 'transparent', color: illustrated ? '#4a2b25' : 'var(--accent)', display: 'inline-flex', alignItems: 'center', fontSize: 13, fontWeight: 900, boxShadow: illustrated ? '0 8px 20px rgba(74,43,37,0.12)' : undefined }}>{exposurePhase === 'saving' ? 'Открываем регистрацию…' : ctaLabel}</span>
        </span>
      </button>
      {exposurePhase === 'error' ? (
        <Text role="alert" variant="caption" style={{ marginTop: 8, color: '#a33b4c' }}>
          Не удалось открыть регистрацию. Попробуйте ещё раз.
        </Text>
      ) : null}
    </section>
  );
});

export function RegistrationGiftAccountStatus({ status }) {
  if (!shouldShowRegistrationGiftAccountStatus(status)) return null;
  const fulfilled = status.fulfilled === true;
  const title = status.campaign?.title || 'Подарок за регистрацию';
  const terms = status.campaign?.terms || status.campaign?.body || 'Добавим подарок к первому заказу.';
  return (
    <section aria-label="Статус подарка" style={{ marginTop: 16, padding: 14, border: '1px solid var(--border)', borderRadius: 18, background: 'var(--c-accent-06, #fff7fa)', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--accent)' }}><Gift size={20} /></span>
      <span>
        <Text variant="subtitle">{title}</Text>
        <Text variant="caption" muted style={{ marginTop: 3 }}>
          {fulfilled ? 'Подарок уже передан с заказом.' : terms}
        </Text>
      </span>
    </section>
  );
}

