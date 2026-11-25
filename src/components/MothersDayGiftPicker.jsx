import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ImageOff, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { extractAnalyticsAttribution, trackAnalytics } from '../lib/analytics';
import { hasMothersDayCampaignEnded } from '../lib/mothersDayCampaign';
import { normalizeGiftPickerSegment, recommendMothersDayProducts } from '../lib/mothersDayRecommendations';
import { analyzePhotoLocally, paletteTokenColor, PHOTO_MAX_BYTES } from '../lib/photoPalette';
import { useAppState } from '../state/AppState';
import { MothersDayRecommendationResults } from './domain/MothersDayRecommendationResults';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';

const STYLES = [
  { id: 'soft', label: 'Нежный', hint: 'Пудровые и воздушные оттенки' },
  { id: 'bright', label: 'Яркий', hint: 'Сочные и контрастные акценты' },
  { id: 'light', label: 'Светлый', hint: 'Белая и кремовая гамма' },
  { id: 'rich', label: 'Насыщенный', hint: 'Глубокие выразительные тона' },
];
const ERROR_COPY = {
  PHOTO_TYPE_NOT_ALLOWED: 'Выберите JPEG, PNG или WebP.',
  PHOTO_TOO_LARGE: 'Фото больше 15 МБ. Выберите файл поменьше.',
  PHOTO_EMPTY: 'Не удалось прочитать это фото.',
  PHOTO_DECODE_FAILED: 'Формат не удалось открыть. Попробуйте другое фото.',
  PHOTO_UPLOAD_FAILED: 'Защищённая обработка недоступна. Можно обработать фото только на устройстве.',
};

function privateEvent(event, input = {}, options = {}) {
  return trackAnalytics(event, input, { ...options, firstPartyOnly: true });
}
function suggestedStyle(profile) {
  if (profile?.tone === 'vivid') return 'bright';
  if (profile?.lightness === 'light') return 'light';
  if (profile?.lightness === 'dark') return 'rich';
  return 'soft';
}

export function MothersDayGiftPicker() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useAppState();
  const inputRef = useRef(null);
  const [step, setStep] = useState('intro');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [processingMode, setProcessingMode] = useState('private');
  const [profile, setProfile] = useState(null);
  const [styleCode, setStyleCode] = useState('soft');
  const [recommendation, setRecommendation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const source = profile ? 'photo' : 'manual';
  const queryParams = new URLSearchParams(location.search);
  const campaignSegment = normalizeGiftPickerSegment(queryParams.get('segment') || queryParams.get('utm_content') || extractAnalyticsAttribution().utm_content);

  useEffect(() => { privateEvent('gift_picker_view', { meta: { source: 'fallback' } }, { dedupeKey: 'picker-route' }); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  if (hasMothersDayCampaignEnded()) return <Navigate to={`/catalog${location.search || ''}`} replace />;

  const forgetFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };
  const chooseFile = (selected) => {
    forgetFile(); setError(''); setConsent(false);
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(String(selected.type).toLowerCase())) return setError('PHOTO_TYPE_NOT_ALLOWED');
    if (selected.size > PHOTO_MAX_BYTES) return setError('PHOTO_TOO_LARGE');
    setFile(selected); setPreviewUrl(URL.createObjectURL(selected));
    privateEvent('gift_picker_photo_selected', { meta: { source: 'photo' } });
  };
  const processPhoto = async () => {
    if (!file || !consent || busy) return;
    setBusy(true); setError('');
    try {
      const analyzed = processingMode === 'private'
        ? await api.analyzeGiftPickerPhoto(file, { consent: true })
        : await analyzePhotoLocally(file);
      setProfile(analyzed); setStyleCode(suggestedStyle(analyzed)); setStep('preferences');
      privateEvent('gift_picker_photo_processed', { meta: { source: 'photo', styleCode: suggestedStyle(analyzed) } });
    } catch (processError) {
      const code = processError?.message === 'PHOTO_UPLOAD_FAILED' ? 'PHOTO_UPLOAD_FAILED' : (processError?.code || processError?.message || 'PHOTO_PROCESSING_FAILED');
      setError(code);
      privateEvent('gift_picker_error', { meta: { source: 'photo', errorCode: String(code).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80) } });
    } finally { forgetFile(); setBusy(false); }
  };
  const startManual = () => {
    forgetFile(); setProfile(null); setStyleCode('soft'); setStep('preferences'); setError('');
    privateEvent('gift_picker_manual_started', { meta: { source: 'manual' } });
  };
  const buildRecommendation = () => {
    const next = recommendMothersDayProducts({ products: state.products.items, collections: state.collections.items, profile, styleCode, campaignSegment, limit: 6 });
    setRecommendation(next); setStep('results');
    privateEvent('gift_picker_results_view', { meta: { source, styleCode, resultCount: next.resultCount, tierCoverage: String(next.tierCoverage) } });
  };
  const reset = () => {
    forgetFile(); setConsent(false); setProfile(null); setRecommendation(null); setStyleCode('soft'); setError(''); setStep('intro');
    privateEvent('gift_picker_reset', { meta: { source } });
  };

  return (
    <AppShell style={{ '--app-shell-extra-bottom': '32px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <IconButton onClick={() => navigate(-1)} aria-label="Назад"><ChevronLeft size={22} /></IconButton>
        <div><h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.05 }}>Букет для мамы</h1><p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>Персональная подборка до 6 вариантов</p></div>
      </header>

      {step === 'intro' ? <main style={{ marginTop: 22, display: 'grid', gap: 16 }}>
        <section style={{ padding: 18, borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 17, display: 'grid', placeItems: 'center', background: 'var(--c-accent-10)', color: 'var(--accent)' }}><Camera size={25} /></div>
          <h2 style={{ margin: '14px 0 0', fontSize: 22 }}>Выберите фотографию</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)', lineHeight: 1.48 }}>FLOWIE возьмёт только общую цветовую палитру кадра. Мы не распознаём лицо, личность, возраст или эмоции.</p>
          <div className="ym-hide-content" style={{ marginTop: 16 }}>
            <input ref={inputRef} className="ym-disable-keys" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} tabIndex={-1} aria-hidden="true" />
            {previewUrl ? <div style={{ display: 'grid', gap: 10 }}><img src={previewUrl} alt="Выбранное фото" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 16 }} /><button type="button" onClick={forgetFile} style={{ minHeight: 44, borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Trash2 size={17} /> Удалить и выбрать другое</button></div>
              : <button type="button" onClick={() => inputRef.current?.click()} style={{ width: '100%', minHeight: 52, borderRadius: 15, border: 0, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Camera size={19} /> Выбрать фото</button>}
          </div>
          {file ? <>
            <fieldset style={{ margin: '14px 0 0', padding: 0, border: 0 }}><legend style={{ fontSize: 13, fontWeight: 900 }}>Как обработать фото</legend><label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 13 }}><input type="radio" name="photo-mode" checked={processingMode === 'private'} onChange={() => setProcessingMode('private')} /> Защищённо на сервере: файл очищается от метаданных и сразу удаляется</label><label style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 13 }}><input type="radio" name="photo-mode" checked={processingMode === 'local'} onChange={() => setProcessingMode('local')} /> Только на этом устройстве</label></fieldset>
            <label style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, lineHeight: 1.4, cursor: 'pointer' }}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} style={{ marginTop: 2 }} /><span>Подтверждаю, что могу использовать это фото, и согласен(на) на {processingMode === 'private' ? 'кратковременную защищённую передачу и обработку' : 'локальную обработку'} для подбора. <Link to="/legal/privacy">Подробнее</Link></span></label>
          </> : null}
          {error ? <div role="alert" style={{ marginTop: 12, padding: 11, borderRadius: 12, background: '#fff1f2', color: '#9f1239', fontSize: 13, fontWeight: 800 }}>{ERROR_COPY[error] || 'Не удалось обработать фото. Выберите другое или продолжите без него.'}</div> : null}
          {file ? <button type="button" disabled={!consent || busy} onClick={processPhoto} style={{ width: '100%', minHeight: 50, marginTop: 14, borderRadius: 15, border: 0, background: consent && !busy ? 'var(--accent)' : 'var(--c-ink-14)', color: consent && !busy ? 'var(--c-accent-contrast)' : 'var(--muted)', fontWeight: 1000 }}>{busy ? 'Берём цвета…' : 'Использовать цвета снимка'}</button> : null}
        </section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}><span style={{ height: 1, background: 'var(--border)', flex: 1 }} />или<span style={{ height: 1, background: 'var(--border)', flex: 1 }} /></div>
        <button type="button" onClick={startManual} style={{ minHeight: 50, borderRadius: 15, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 1000, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><ImageOff size={19} /> Подобрать без фото</button>
        <div style={{ padding: 14, borderRadius: 16, background: 'var(--c-accent-10)', display: 'flex', gap: 10, color: 'var(--muted)', fontSize: 13, lineHeight: 1.42 }}><ShieldCheck size={20} color="var(--accent)" style={{ flexShrink: 0 }} /><span>Фото используется только для извлечения контролируемых цветовых признаков. Исходник, имя и хеш не сохраняются; после обработки остаются только названия оттенков.</span></div>
      </main> : null}

      {step === 'preferences' ? <main style={{ marginTop: 24 }}>
        <Sparkles size={28} color="var(--accent)" /><h2 style={{ margin: '10px 0 0', fontSize: 24 }}>Какой стиль ближе?</h2><p style={{ margin: '7px 0 0', color: 'var(--muted)', lineHeight: 1.45 }}>{profile ? 'Мы предложили вариант по палитре. Вы можете его изменить.' : 'Выберите настроение букета — никаких фото не требуется.'}</p>
        {profile ? <div style={{ marginTop: 14, padding: 13, borderRadius: 15, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><div><div style={{ fontWeight: 900 }}>Палитра снимка</div><div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 12 }}>Фото уже удалено из памяти FLOWIE</div></div><div aria-label="Извлечённые оттенки" style={{ display: 'flex', gap: 6 }}>{profile.palette.map((token) => <span key={token} title={token} style={{ width: 28, height: 28, borderRadius: 999, background: paletteTokenColor(token), border: '2px solid white', boxShadow: '0 0 0 1px var(--border)' }} />)}</div></div> : null}
        <div role="radiogroup" aria-label="Стиль букета" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>{STYLES.map((style) => { const active = styleCode === style.id; return <button key={style.id} type="button" role="radio" aria-checked={active} onClick={() => setStyleCode(style.id)} style={{ minHeight: 92, padding: 12, borderRadius: 15, border: active ? '2px solid var(--accent)' : '1px solid var(--border)', background: active ? 'var(--c-accent-10)' : 'var(--surface)', color: 'var(--text)', textAlign: 'left' }}><strong style={{ display: 'block', fontSize: 15 }}>{style.label}</strong><span style={{ display: 'block', marginTop: 5, color: 'var(--muted)', fontSize: 12, lineHeight: 1.3 }}>{style.hint}</span></button>; })}</div>
        <button type="button" disabled={!state.products.items.length} onClick={buildRecommendation} style={{ width: '100%', minHeight: 52, marginTop: 18, border: 0, borderRadius: 15, background: 'var(--accent)', color: 'var(--c-accent-contrast)', fontWeight: 1000 }}>{state.products.items.length ? 'Показать подборку' : 'Загружаем букеты…'}</button>
      </main> : null}

      {step === 'results' && recommendation ? <main style={{ marginTop: 24, paddingBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 25 }}>Ваша подборка</h2><p style={{ margin: '7px 0 20px', color: 'var(--muted)', lineHeight: 1.45 }}>{recommendation.resultCount ? `${recommendation.resultCount} вариантов в ${recommendation.tierCoverage} ценовых уровнях.` : 'Подходящих вариантов сейчас нет — откройте полную подборку.'}</p>
        <MothersDayRecommendationResults recommendation={recommendation} source={source} />
        <div style={{ marginTop: 22, display: 'grid', gap: 9 }}><button type="button" onClick={() => setStep('preferences')} style={{ minHeight: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 900 }}>Изменить стиль</button><button type="button" onClick={reset} style={{ minHeight: 48, borderRadius: 14, border: 0, background: 'var(--c-ink-08)', color: 'var(--text)', fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><RefreshCw size={17} /> Начать заново</button><button type="button" onClick={() => navigate('/mothers-day')} style={{ minHeight: 46, border: 0, background: 'transparent', color: 'var(--accent)', fontWeight: 900 }}>Все букеты для мамы</button></div>
      </main> : null}
    </AppShell>
  );
}
