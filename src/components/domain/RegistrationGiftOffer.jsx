import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import { REGISTRATION_GIFT_DWELL_MS, shouldShowRegistrationGift, shouldShowRegistrationGiftAccountStatus } from '../../lib/registrationGift';
import { Text } from '../ui/Text';

export function RegistrationGiftOffer({ status, user, placement, onExpose, onLogin, onRefresh }) {
  const rootRef = useRef(null);
  const exposurePromiseRef = useRef(null);
  const [exposurePhase, setExposurePhase] = useState(status?.exposed ? 'saved' : 'idle');

  useEffect(() => {
    if (status?.exposed) setExposurePhase('saved');
  }, [status?.exposed]);

  const ensureExposure = useCallback(() => {
    if (status?.exposed || exposurePhase === 'saved') return Promise.resolve(true);
    if (exposurePromiseRef.current) return exposurePromiseRef.current;
    if (typeof onExpose !== 'function') {
      setExposurePhase('error');
      return Promise.resolve(false);
    }

    setExposurePhase('saving');
    const request = Promise.resolve(onExpose({ placement }))
      .then(() => {
        setExposurePhase('saved');
        return true;
      })
      .catch(() => {
        setExposurePhase('error');
        return false;
      })
      .finally(() => {
        exposurePromiseRef.current = null;
      });
    exposurePromiseRef.current = request;
    return request;
  }, [exposurePhase, onExpose, placement, status?.exposed]);

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

  if (!shouldShowRegistrationGift(status)) return null;

  const title = status.campaign?.title || 'Raffaello к первому заказу за регистрацию';
  const body = status.campaign?.body || 'Зарегистрируйтесь — Raffaello добавим к вашему первому заказу.';
  const ctaLabel = exposurePhase === 'error'
    ? 'Повторить и зарегистрироваться'
    : status.campaign?.ctaLabel || (user?.phoneVerified ? 'Проверить статус' : 'Зарегистрироваться');

  const activate = async () => {
    if (user?.phoneVerified) {
      onRefresh?.();
      return;
    }
    const recorded = await ensureExposure();
    if (recorded) onLogin?.();
  };

  return (
    <section ref={rootRef} aria-label={title} style={{ marginTop: 20 }}>
      <button
        type="button"
        onClick={activate}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '48px minmax(0, 1fr)',
          gap: 12,
          alignItems: 'center',
          padding: 14,
          border: '1px solid var(--border)',
          borderRadius: 20,
          background: 'var(--c-accent-06, #fff7fa)',
          color: 'var(--c-ink-92)',
          textAlign: 'left',
          cursor: 'pointer',
          opacity: exposurePhase === 'saving' ? 0.72 : 1,
        }}
      >
        <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--accent)' }}>
          <Gift size={23} strokeWidth={2.2} />
        </span>
        <span style={{ minWidth: 0 }}>
          <Text variant="subtitle">{title}</Text>
          <Text variant="caption" muted style={{ marginTop: 3 }}>{body}</Text>
          <Text variant="caption" style={{ marginTop: 7, color: 'var(--accent)', fontWeight: 850 }}>{exposurePhase === 'saving' ? 'Сохраняем подарок…' : ctaLabel}</Text>
        </span>
      </button>
      {exposurePhase === 'error' ? (
        <Text role="alert" variant="caption" style={{ marginTop: 8, color: '#a33b4c' }}>
          Не удалось сохранить подарок. Нажмите ещё раз, чтобы повторить.
        </Text>
      ) : null}
    </section>
  );
}

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

