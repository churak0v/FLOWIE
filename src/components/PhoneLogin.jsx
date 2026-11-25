import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { persistPersonalDataConsent } from '../lib/authUi';
import { Text } from './ui/Text';

function normalizePhoneInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return '';
}
function errorText(error) {
  const code = error?.data?.error || error?.message;
  if (code === 'SMS_AUTH_DISABLED') return 'Вход по телефону временно недоступен.';
  if (code === 'OTP_RESEND_TOO_SOON') return 'Новый код можно запросить чуть позже.';
  if (code === 'OTP_RATE_LIMITED') return 'Слишком много запросов. Попробуйте позже.';
  if (code === 'INVALID_OR_EXPIRED_CODE') return 'Неверный или просроченный код.';
  if (code === 'PHONE_ALREADY_IN_USE') return 'Этот номер уже связан с другим профилем.';
  if (code === 'CONSENT_REQUIRED') return 'Подтвердите согласие на обработку персональных данных.';
  if (code === 'CONSENT_SAVE_FAILED') return 'Не удалось сохранить согласие. Попробуйте ещё раз.';
  return 'Не удалось выполнить вход. Попробуйте ещё раз.';
}

export function PhoneLogin({ initialPhone = '', onSuccess, onCancel }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(initialPhone || '+7');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState(null);

  useEffect(() => {
    if (!retryAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const normalizedPhone = useMemo(() => normalizePhoneInput(phone), [phone]);
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));

  async function requestCode() {
    if (!normalizedPhone || !consentAccepted || busy || retrySeconds > 0) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.requestPhoneOtp(normalizedPhone);
      setChallengeId(String(result?.challengeId || ''));
      setRetryAt(Date.now() + Number(result?.resendAfter || 60) * 1000);
      setCode('');
      setStep('code');
    } catch (requestError) {
      setError(errorText(requestError));
      const retryAfter = Number(requestError?.data?.retryAfter || 0);
      if (retryAfter > 0) setRetryAt(Date.now() + retryAfter * 1000);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!challengeId || !consentAccepted || !/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.verifyPhoneOtp({ challengeId, code });
      setVerifiedUser(result?.user || null);
      // The OTP endpoints do not persist legal consent. Store it on the newly
      // verified session before exposing the authenticated UI.
      await persistPersonalDataConsent({ accepted: consentAccepted, updateMe: api.updateMe });
      await onSuccess?.(result?.user || null);
    } catch (verifyError) {
      setError(errorText(verifyError));
    } finally {
      setBusy(false);
    }
  }

  async function retryConsent() {
    if (!verifiedUser || busy) return;
    setBusy(true);
    setError('');
    try {
      await persistPersonalDataConsent({ accepted: consentAccepted, updateMe: api.updateMe });
      await onSuccess?.(verifiedUser);
    } catch (consentError) {
      setError(errorText(consentError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Text variant="title">{step === 'phone' ? 'Войти по телефону' : 'Введите код'}</Text>
      <div style={{ marginTop: 8 }}>
        <Text variant="body" muted>
          {step === 'phone'
            ? 'Пришлём одноразовый код в SMS. Заказы гостя сохранятся в профиле.'
            : `Код отправлен на ${normalizedPhone}. Он действует 5 минут.`}
        </Text>
      </div>

      {step === 'phone' ? (
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="+7 999 000-00-00"
          style={{ width: '100%', marginTop: 16, border: '1px solid var(--border)', borderRadius: 16, padding: 12, background: 'var(--c-white)' }}
        />
      ) : (
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          aria-label="Код из SMS"
          style={{ width: '100%', marginTop: 16, border: '1px solid var(--border)', borderRadius: 16, padding: 12, background: 'var(--c-white)', letterSpacing: '0.28em', fontSize: 22, textAlign: 'center' }}
        />
      )}

      <label style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: step === 'phone' ? 'pointer' : 'default' }}>
        <input
          type="checkbox"
          checked={consentAccepted}
          disabled={step !== 'phone' || busy}
          onChange={(event) => setConsentAccepted(event.target.checked)}
          style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--muted)' }}>
          Я согласен на{' '}
          <a href="/legal/consent" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 800 }}>
            обработку персональных данных
          </a>{' '}
          и ознакомился с{' '}
          <a href="/legal/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 800 }}>
            политикой конфиденциальности
          </a>.
        </span>
      </label>

      {error ? <div style={{ marginTop: 8, color: '#b42318' }}><Text variant="caption">{error}</Text></div> : null}

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <button
          type="button"
          disabled={busy || !consentAccepted || (step === 'phone' ? !normalizedPhone || retrySeconds > 0 : !verifiedUser && !/^\d{6}$/.test(code))}
          onClick={step === 'phone' ? requestCode : verifiedUser ? retryConsent : verifyCode}
          style={{ height: 52, border: 0, borderRadius: 'var(--r-lg)', background: 'var(--accent)', color: 'var(--c-white)', fontWeight: 1000 }}
        >
          {busy ? 'Подождите…' : step === 'phone' ? (retrySeconds ? `Повторить через ${retrySeconds} с` : 'Получить код') : verifiedUser ? 'Завершить вход' : 'Войти'}
        </button>

        {step === 'code' ? (
          <button type="button" disabled={Boolean(verifiedUser)} onClick={() => setStep('phone')} style={{ height: 44, border: 0, background: 'transparent', fontWeight: 900, opacity: verifiedUser ? 0.45 : 1 }}>
            Изменить номер
          </button>
        ) : null}
        <button type="button" onClick={onCancel} style={{ height: 44, border: 0, background: 'transparent', color: 'var(--muted)', fontWeight: 900 }}>
          Отмена
        </button>
      </div>
    </div>
  );
}
