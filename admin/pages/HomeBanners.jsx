import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ImagePlus, RefreshCw, Save } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { AppImage } from '../../src/components/ui/AppImage';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';

const field = {
  width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '10px 12px',
  border: '1px solid var(--border)', borderRadius: 14,
  background: 'var(--surface)', color: 'var(--text)', font: 'inherit',
};
const titles = { mother: 'День матери', birthday: 'День рождения', premium: 'Премиальные букеты' };
const messages = {
  LAST_BANNER_REQUIRED: 'Нужно оставить хотя бы один активный баннер.',
  BANNER_HREF_INVALID: 'Укажите внутреннюю ссылку: /catalog, /shop или /product/ID.',
  BANNER_IMAGE_INVALID: 'Загрузите фото через админку или выберите существующее локальное изображение.',
  BANNER_TEXT_INVALID: 'Проверьте заголовок и подзаголовок.',
};

export function HomeBannersPage() {
  const navigate = useNavigate();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await adminApi.getHomeBanners();
      setBanners(result?.banners || []);
    } catch (e) {
      setError('Не удалось получить баннеры: ' + (e?.data?.error || e?.message || 'ошибка'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function patchBanner(id, changes) {
    setNotice('');
    setBanners(current => current.map(b => b.id === id ? { ...b, ...changes } : b));
  }

  async function upload(id, file) {
    if (!file) return;
    setError('');
    setUploading(id);
    try {
      const image = await adminApi.uploadFile(file);
      patchBanner(id, { image });
      setNotice('Фото загружено. Нажмите «Сохранить», чтобы опубликовать новый баннер.');
    } catch (e) {
      setError('Не удалось загрузить фото: ' + (e?.message || 'ошибка'));
    } finally {
      setUploading('');
    }
  }

  async function save(banner) {
    setSaving(banner.id);
    setError('');
    setNotice('');
    try {
      const payload = {
        caption: banner.caption,
        subtitle: banner.subtitle,
        image: banner.image,
        href: banner.href,
        imagePosition: banner.imagePosition,
        sort: Number(banner.sort),
        isActive: Boolean(banner.isActive),
      };
      const result = await adminApi.updateHomeBanner(banner.id, payload);
      patchBanner(banner.id, result.banner);
      setNotice('Баннер «' + (titles[banner.id] || banner.caption) + '» опубликован.');
    } catch (e) {
      const code = e?.data?.error || '';
      setError(messages[code] || 'Не удалось сохранить баннер: ' + (code || e?.message));
    } finally {
      setSaving('');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, paddingBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" aria-label="В профиль" onClick={() => navigate('/profile')}
          style={{ border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
          <ChevronLeft size={24} />
        </button>
        <Text variant="title">Баннеры главной</Text>
        <button type="button" onClick={() => void load()} aria-label="Обновить" disabled={loading}
          style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
          <RefreshCw size={19} />
        </button>
      </div>
      <Text variant="body" muted>
        Фотографии, заголовки и ссылки можно менять без нового релиза. Для ссылки на тематическую
        подборку сначала создайте её и добавьте товары в разделе «Подборки».
        Например: /catalog?collection=den-materi-2026
      </Text>
      {error ? <Surface variant="soft" style={{ padding: 12, color: '#b42318' }}>{error}</Surface> : null}
      {notice ? <Surface variant="soft" style={{ padding: 12 }}>{notice}</Surface> : null}
      {loading ? <Text variant="body">Загрузка…</Text> : null}
      {!loading && !banners.length ? <Text variant="body">Баннеры не найдены. Проверьте миграцию базы.</Text> : null}
      {banners.map(banner => (
        <Surface key={banner.id} variant="soft" style={{
          padding: 14, display: 'grid', gap: 12, borderRadius: 18,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="subtitle">{titles[banner.id] || banner.id}</Text>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={Boolean(banner.isActive)}
                onChange={e => patchBanner(banner.id, { isActive: e.target.checked })} />
              Показывать
            </label>
          </div>
          <div style={{ width: '100%', height: 180, position: 'relative', overflow: 'hidden',
            borderRadius: 15, background: 'var(--surface-2)' }}>
            <AppImage src={banner.image} alt="" variant="hero" sizes="100vw"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: banner.imagePosition }} />
            <div style={{ position: 'absolute', inset: 0, padding: 14, display: 'flex', flexDirection: 'column',
              justifyContent: 'end', color: '#fff', pointerEvents: 'none',
              background: 'linear-gradient(0deg,rgba(0,0,0,.65),transparent 80%)' }}>
              <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.05 }}>{banner.caption}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>{banner.subtitle}</div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <ImagePlus size={19}/>
            {uploading === banner.id ? 'Загружаем фото…' : 'Заменить фотографию'}
            <input type="file" accept="image/jpeg,image/png,image/webp"
              disabled={Boolean(uploading || saving)} style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void upload(banner.id, file);
              }}/>
          </label>

          <label>Заголовок
            <input style={field} maxLength={100} value={banner.caption}
              onChange={e => patchBanner(banner.id, { caption: e.target.value })}/>
          </label>
          <label>Описание
            <textarea style={{ ...field, minHeight: 76 }} maxLength={220} value={banner.subtitle}
              onChange={e => patchBanner(banner.id, { subtitle: e.target.value })}/>
          </label>
          <label>Ссылка по нажатию
            <input style={field} maxLength={300} value={banner.href}
              placeholder="/catalog?collection=den-materi-2026"
              onChange={e => patchBanner(banner.id, { href: e.target.value })}/>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>Порядок
              <input style={field} type="number" min={0} max={1000} value={banner.sort}
                onChange={e => patchBanner(banner.id, { sort: e.target.value })}/>
            </label>
            <label>Положение фото
              <input style={field} value={banner.imagePosition} placeholder="center 54%"
                onChange={e => patchBanner(banner.id, { imagePosition: e.target.value })}/>
            </label>
          </div>
          <button type="button" disabled={Boolean(saving || uploading)} onClick={() => void save(banner)}
            style={{ minHeight: 50, borderRadius: 14, border: 0, background: 'var(--accent)',
              color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
            <Save size={18} />{saving === banner.id ? 'Сохраняем…' : 'Сохранить баннер'}
          </button>
        </Surface>
      ))}
    </div>
  );
}
