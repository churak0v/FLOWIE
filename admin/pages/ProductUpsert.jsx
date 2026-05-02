import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ImagePlus, Save, UploadCloud, Crop as CropIcon, X } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { prefetchImages } from '../../src/lib/prefetch';
import { readCacheEntry, removeCacheEntry, writeCacheEntry } from '../../src/lib/persistedCache';
import { SquareCropModal } from '../components/SquareCropModal';
import { Surface } from '../../src/components/ui/Surface';
import { Text } from '../../src/components/ui/Text';
import { AppImage } from '../../src/components/ui/AppImage';
import { ProductDescription } from '../../src/components/domain/ProductDescription';

async function sendDebug(event, meta = null) {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ event, meta }),
    });
  } catch {
    // ignore
  }
}

const inputStyle = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 12,
  background: 'var(--c-white)',
};

async function fetchFileFromUrl(url, fallbackName = 'image.jpg') {
  if (!url) throw new Error('NO_URL');
  const res = await fetch(url);
  if (!res.ok) throw new Error('FETCH_FAILED');
  const blob = await res.blob();
  const name = fallbackName || 'image.jpg';
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

function Field({ label, children }) {
  return (
    <div>
      <Text variant="caption">{label}</Text>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ImageTile({ img, draggableProps, onDragStart, onDragOver, onDrop }) {
  const uploading = img?.status === 'uploading';
  const failed = img?.status === 'error';
  const title = failed
    ? img?.error || 'Ошибка загрузки'
    : uploading
      ? 'Загрузка…'
      : img?.canCrop
        ? 'Нажмите, чтобы кадрировать. Перетащите, чтобы изменить порядок'
        : 'Перетащите, чтобы изменить порядок';
  return (
    <div
      draggable={!uploading}
      onClick={() => {
        if (uploading) return;
        if (img?.canCrop) img.onCrop?.();
      }}
      onDragStart={(e) => {
        if (uploading) {
          e.preventDefault();
          return;
        }
        try {
          e.dataTransfer?.setData('text/plain', String(img.id));
          e.dataTransfer.effectAllowed = 'move';
        } catch {
          // ignore
        }
        onDragStart?.(e);
      }}
      onDragOver={(e) => {
        if (uploading) return;
        onDragOver?.(e);
      }}
      onDrop={(e) => {
        if (uploading) return;
        e.preventDefault();
        onDrop?.(e);
      }}
      style={{
        width: 74,
        height: 74,
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        cursor: uploading ? 'default' : img?.canCrop ? 'pointer' : 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitUserDrag: 'element',
        position: 'relative',
        ...draggableProps,
      }}
      title={title}
    >
      <AppImage
        src={img.url}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
      />

      {uploading || failed ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: uploading ? 'rgba(0,0,0,0.28)' : 'rgba(180,0,0,0.22)',
            color: 'var(--c-white)',
            fontWeight: 1000,
            fontSize: 11,
            textAlign: 'center',
            padding: 6,
          }}
        >
          {uploading ? 'Загрузка…' : 'Ошибка'}
          {uploading ? (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: 6,
                background: 'linear-gradient(90deg, rgba(255,255,255,0.2), rgba(255,255,255,0.8), rgba(255,255,255,0.2))',
                backgroundSize: '200% 100%',
                animation: 'progressStripes 1s linear infinite',
                opacity: 0.9,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {img.canCrop ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (uploading) return;
            img.onCrop?.();
          }}
          aria-label="Кадрировать"
          disabled={uploading}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 26,
            height: 26,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.55)',
            color: 'white',
            display: 'grid',
            placeItems: 'center',
            cursor: uploading ? 'default' : 'pointer',
            opacity: uploading ? 0.55 : 1,
          }}
        >
          <CropIcon size={12} />
        </button>
      ) : null}

      {img.canDelete ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            img.onDelete?.();
          }}
          aria-label="Удалить"
          disabled={uploading}
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            width: 26,
            height: 26,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.55)',
            color: 'white',
            display: 'grid',
            placeItems: 'center',
            cursor: uploading ? 'default' : 'pointer',
            opacity: uploading ? 0.55 : 1,
          }}
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

function ProductForm({ mode, id }) {
  const navigate = useNavigate();
  const location = useLocation();
  const defaultKind = useMemo(() => {
    try {
      const qs = new URLSearchParams(String(location.search || ''));
      return (qs.get('kind') || '').toLowerCase() === 'upsell' ? 'upsell' : 'main';
    } catch {
      return 'main';
    }
  }, [location.search]);

  const showDebug = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      const qs = new URLSearchParams(String(location.search || ''));
      return qs.get('debug') === '1';
    } catch {
      return false;
    }
  }, [location.search]);

  const cacheKey = useMemo(() => (mode === 'edit' && id ? `admin_product_edit_${id}` : ''), [id, mode]);
  const cachedBoot = useMemo(() => (cacheKey ? readCacheEntry(cacheKey) : null), [cacheKey]);
  const cachedData = cachedBoot?.data || null;

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => mode === 'edit' && !cachedData);
  const [error, setError] = useState('');

  const [collections, setCollections] = useState(() => (Array.isArray(cachedData?.collections) ? cachedData.collections : []));

  const [form, setForm] = useState(() => ({
    name: '',
    price: '',
    discount: '',
    deliveryTime: '',
    color: '',
    width: '',
    height: '',
    tags: '',
    description: '',
    isUpsell: defaultKind === 'upsell',
    upsellSort: '',
    ...(cachedData?.form || {}),
  }));

  const [compositionItems, setCompositionItems] = useState(() => {
    if (Array.isArray(cachedData?.compositionItems) && cachedData.compositionItems.length) return cachedData.compositionItems;
    return [{ name: '', quantity: '' }];
  });
  const [collectionIds, setCollectionIds] = useState(() => (Array.isArray(cachedData?.collectionIds) ? cachedData.collectionIds : []));

  const [coverUrl, setCoverUrl] = useState(() => String(cachedData?.coverUrl || ''));
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState('');
  const coverObjectUrlRef = useRef('');

  const [gallery, setGallery] = useState(() => (Array.isArray(cachedData?.gallery) ? cachedData.gallery : [])); // [{id,url,status,remoteUrl?,file?}]
  const [galleryUploadingCount, setGalleryUploadingCount] = useState(0);
  const dragId = useRef(null);
  const galleryRef = useRef([]);
  const galleryPendingQueue = useRef([]);

  const cacheAppliedRef = useRef(Boolean(cachedData));

  function setGalleryAndRef(next) {
    galleryRef.current = next;
    setGallery(next);
  }

  // Кадрирование: по умолчанию загружаем как есть, но можно вручную кадрировать.
  const cropPendingRef = useRef(null); // { file, objectUrl, target }
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState('');

  async function fetchFileFromUrl(url, filename = 'image.jpg') {
    if (!url) throw new Error('EMPTY_URL');
    const res = await fetch(url);
    if (!res.ok) throw new Error('FETCH_FAILED');
    const blob = await res.blob();
    const name = filename || 'image.jpg';
    return new File([blob], name, { type: blob.type || 'image/jpeg' });
  }

  function requestSquareCrop(file, target = null) {
    return new Promise((resolve, reject) => {
      try {
        const objectUrl = URL.createObjectURL(file);
        cropPendingRef.current = { file, objectUrl, target, resolve, reject };
        setCropSrc(objectUrl);
        setCropOpen(true);
      } catch (e) {
        reject(e);
      }
    });
  }

  function resetCropState() {
    try {
      if (cropPendingRef.current?.objectUrl) URL.revokeObjectURL(cropPendingRef.current.objectUrl);
    } catch {
      // ignore
    }
    cropPendingRef.current = null;
    setCropSrc('');
    setCropOpen(false);
  }

  function handleCropCancel() {
    if (cropPendingRef.current?.reject) {
      cropPendingRef.current.reject(new Error('CROP_CANCEL'));
    }
    resetCropState();
  }

  async function handleCropConfirm(blob) {
    const pending = cropPendingRef.current;
    if (!pending) return resetCropState();
    const target = pending.target;
    const file = new File([blob], pending.file?.name || 'image.jpg', {
      type: blob.type || pending.file?.type || 'image/jpeg',
    });
    pending.resolve?.(file);
    resetCropState();

    if (target === 'cover') {
      await pickCover(file);
    }
  }

  const galleryIds = useMemo(() => gallery.map((g) => Number(g.id)).filter((x) => Number.isFinite(x)), [gallery]);
  const galleryUploadedUrls = useMemo(
    () =>
      gallery
        .filter((g) => g?.status === 'uploaded')
        .map((g) => g.remoteUrl || g.url)
        .filter(Boolean),
    [gallery],
  );

  useEffect(() => {
    galleryRef.current = gallery;
  }, [gallery]);

  const getGalleryUrls = () =>
    galleryRef.current
      .filter((g) => g?.status === 'uploaded')
      .map((g) => g.remoteUrl || g.url)
      .filter(Boolean);

  useEffect(() => {
    cacheAppliedRef.current = Boolean(cachedData);
  }, [cacheKey, cachedData]);

  useEffect(() => {
    if (!cacheKey || cacheAppliedRef.current) return;
    const cached = readCacheEntry(cacheKey);
    if (cached?.data) {
      const data = cached.data || {};
      cacheAppliedRef.current = true;
      if (data.form) {
        setForm((prev) => ({
          ...prev,
          ...data.form,
        }));
      }
      if (Array.isArray(data.compositionItems) && data.compositionItems.length) {
        setCompositionItems(data.compositionItems);
      }
      if (Array.isArray(data.collectionIds)) {
        setCollectionIds(data.collectionIds);
      }
      if (Array.isArray(data.collections)) {
        setCollections(data.collections);
      }
      if (data.coverUrl) {
        setCoverUrl(data.coverUrl);
        setCoverPreviewUrl('');
        setCoverError('');
      }
      if (Array.isArray(data.gallery)) {
        setGalleryAndRef(data.gallery);
      }
      setLoading(false);
      const cachedImages = [
        data.coverUrl || '',
        ...(Array.isArray(data.gallery) ? data.gallery.map((g) => g?.remoteUrl || g?.url) : []),
      ].filter(Boolean);
      prefetchImages(cachedImages, { max: 12 });
    }
  }, [cacheKey]);

  useEffect(() => {
    let alive = true;
    const showLoading = mode === 'edit' && !cacheAppliedRef.current;
    setLoading(showLoading);
    setError('');

    Promise.all([adminApi.getCollections(), mode === 'edit' ? adminApi.getProduct(id) : Promise.resolve(null)])
      .then(([cRes, pRes]) => {
        if (!alive) return;
        setCollections(cRes?.collections || []);

        if (mode !== 'edit') return;
        const p = pRes?.product;
        if (!p) throw new Error('NO_PRODUCT');
        setForm({
          name: p.name || '',
          price: String(p.price ?? ''),
          discount: String(p.discount ?? 0),
          deliveryTime: p.deliveryTime || '',
          tags: p.tags || '',
          description: p.description || '',
          color: p.color || '',
          width: p.width == null ? '' : String(p.width),
          height: p.height == null ? '' : String(p.height),
          isUpsell: Boolean(p.isUpsell),
          upsellSort: p.upsellSort == null ? '' : String(p.upsellSort),
        });
        setCompositionItems(
          (p.composition || []).length ? (p.composition || []).map((x) => ({ name: x.name, quantity: x.quantity })) : [{ name: '', quantity: '' }],
        );
        setCollectionIds((p.collectionItems || []).map((ci) => ci.collectionId).filter(Boolean));
        setCoverUrl(p.image || '');
        setCoverPreviewUrl('');
        setCoverError('');
        setGallery((p.images || []).map((x) => ({ id: x.id, url: x.url, remoteUrl: x.url, status: 'uploaded' })));

        if (cacheKey) {
          const payload = {
            form: {
              name: p.name || '',
              price: String(p.price ?? ''),
              discount: String(p.discount ?? 0),
              deliveryTime: p.deliveryTime || '',
              tags: p.tags || '',
              description: p.description || '',
              color: p.color || '',
              width: p.width == null ? '' : String(p.width),
              height: p.height == null ? '' : String(p.height),
              isUpsell: Boolean(p.isUpsell),
              upsellSort: p.upsellSort == null ? '' : String(p.upsellSort),
            },
            compositionItems: (p.composition || []).length ? (p.composition || []).map((x) => ({ name: x.name, quantity: x.quantity })) : [{ name: '', quantity: '' }],
            collectionIds: (p.collectionItems || []).map((ci) => ci.collectionId).filter(Boolean),
            collections: cRes?.collections || [],
            coverUrl: p.image || '',
            gallery: (p.images || []).map((x) => ({ id: x.id, url: x.url, remoteUrl: x.url, status: 'uploaded' })),
          };
          writeCacheEntry(cacheKey, payload);
          prefetchImages([p.image || '', ...(p.images || []).map((x) => x?.url)].filter(Boolean), { max: 12 });
        }
      })
      .catch((e) => setError(e?.data?.error || e?.message || 'Не удалось загрузить товар'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, mode]);

  useEffect(() => {
    if (!cacheKey) return;
    const urls = [coverUrl, coverPreviewUrl, ...galleryUploadedUrls].filter(Boolean);
    if (urls.length) prefetchImages(urls, { max: 12 });
  }, [cacheKey, coverPreviewUrl, coverUrl, galleryUploadedUrls]);

  useEffect(() => {
    return () => {
      try {
        if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current);
      } catch {
        // ignore
      }
      try {
        for (const img of galleryRef.current || []) {
          const url = img?.url;
          if (url && typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
        }
      } catch {
        // ignore
      }
      try {
        if (cropPendingRef.current?.objectUrl) URL.revokeObjectURL(cropPendingRef.current.objectUrl);
      } catch {
        // ignore
      }
    };
  }, []);

  async function openCoverCrop() {
    try {
      let f = cropPendingRef.current?.file || null;
      if (!f) {
        const src = coverPreviewUrl || coverUrl;
        if (!src) return;
        f = await fetchFileFromUrl(src, 'cover.jpg');
      }
      await requestSquareCrop(f, 'cover');
    } catch {
      // ignore
    }
  }

  function clearCover() {
    try {
      if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current);
    } catch {
      // ignore
    }
    coverObjectUrlRef.current = '';
    setCoverPreviewUrl('');
    setCoverUrl('');
    setCoverError('');
    cropPendingRef.current = null;
  }

  async function pickCover(file) {
    if (!file) return;
    setCoverError('');
    setCoverUploading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      try {
        if (coverObjectUrlRef.current) URL.revokeObjectURL(coverObjectUrlRef.current);
      } catch {
        // ignore
      }
      coverObjectUrlRef.current = localUrl;
      setCoverPreviewUrl(localUrl);
      // сохраняем исходный файл, чтобы можно было повторно кадрировать
      cropPendingRef.current = { file, objectUrl: null, target: 'cover' };

      const url = await adminApi.uploadFile(file);
      setCoverUrl(url);
    } catch (e) {
      setCoverError(e?.message || 'Не удалось загрузить обложку');
    } finally {
      setCoverUploading(false);
    }
  }

  async function uploadGalleryFile(file) {
    await sendDebug('gallery_upload_start', { name: file?.name, size: file?.size });
    const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let localUrl = '';
    try {
      localUrl = URL.createObjectURL(file);
    } catch {
      localUrl = '';
    }

    setGalleryAndRef([...galleryRef.current, { id: localId, url: localUrl, remoteUrl: '', status: 'uploading', file }]);
    setGalleryUploadingCount((c) => c + 1);

    try {
      const remoteUrl = await adminApi.uploadFile(file);

      const nextGallery = galleryRef.current.map((x) =>
        x.id === localId ? { ...x, url: remoteUrl, remoteUrl, status: 'uploaded', file: null } : x,
      );
      setGalleryAndRef(nextGallery);
      await sendDebug('gallery_upload_success', { name: file?.name, url: remoteUrl });
    } catch (e) {
      await sendDebug('gallery_upload_fail', { name: file?.name, error: e?.message || String(e) });
      alert(`Не удалось загрузить фото: ${e?.message || 'ошибка'}`);
      const errored = galleryRef.current.map((x) =>
        x.id === localId ? { ...x, status: 'error', error: e?.message || 'Ошибка загрузки' } : x,
      );
      setGalleryAndRef(errored);
    } finally {
      setGalleryUploadingCount((c) => Math.max(0, c - 1));
      try {
        const stillUsesLocalUrl = galleryRef.current.some((x) => x.id === localId && x.url === localUrl);
        if (localUrl && !stillUsesLocalUrl) URL.revokeObjectURL(localUrl);
      } catch {
        // ignore
      }
    }
  }

  async function addGalleryFiles(files) {
    const list = Array.from(files || []);
    await sendDebug('gallery_onchange', { count: list.length, names: list.map((f) => f.name) });
    galleryPendingQueue.current.push(...list);
    if (galleryUploadingCount > 0) return; // already processing queue

    const processNext = async () => {
      const next = galleryPendingQueue.current.shift();
      if (!next) return;
      await uploadGalleryFile(next);
      await processNext();
    };
    await processNext();
  }

  function removeGalleryImage(imageId) {
    const current = galleryRef.current;
    const img = current.find((x) => x.id === imageId);
    if (!img) return;
    if (img.status === 'uploading') return;
    const ok = window.confirm('Удалить фото из галереи?');
    if (!ok) return;

    try {
      const url = img?.url;
      if (url && typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
    } catch {
      // ignore
    }

    dragId.current = dragId.current === imageId ? null : dragId.current;
    setGalleryAndRef(current.filter((x) => x.id !== imageId));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const name = form.name.trim();
      const price = Number(form.price);
      const discount = Math.max(0, Number(form.discount || 0));
      const isUpsell = Boolean(form.isUpsell);
      const upsellSort = Math.max(0, Number(form.upsellSort || 0));
      if (!name) throw new Error('Введите название');
      if (!Number.isFinite(price) || price <= 0) throw new Error('Введите корректную цену');
      if (!Number.isFinite(discount) || discount < 0) throw new Error('Введите корректную скидку');
      if (!Number.isFinite(upsellSort) || upsellSort < 0) throw new Error('Введите корректную сортировку апсейла');

      if (coverUploading || galleryUploadingCount > 0) throw new Error('Дождитесь загрузки фотографий');
      const image = coverUrl;
      if (!image) throw new Error('Загрузите обложку');

      const comp = (compositionItems || [])
        .map((it) => ({ name: String(it?.name || '').trim(), quantity: String(it?.quantity || '').trim() }))
        .filter((it) => it.name && it.quantity);

      if (mode === 'new') {
        await adminApi.createProduct({
          name,
          price,
          discount,
          image,
          isUpsell,
          upsellSort,
          images: galleryUploadedUrls,
          deliveryTime: form.deliveryTime || null,
          color: form.color || null,
          width: form.width === '' ? null : Number(form.width),
          height: form.height === '' ? null : Number(form.height),
          tags: form.tags || '',
          description: form.description || null,
          compositionItems: comp,
          collectionIds,
        });

        navigate(`/products?kind=${isUpsell ? 'upsell' : 'main'}`);
        return;
      }

      await adminApi.updateProduct(id, {
        name,
        price,
        discount,
        image,
        isUpsell,
        upsellSort,
        deliveryTime: form.deliveryTime || null,
        tags: form.tags || '',
        description: form.description || null,
        color: form.color || null,
        width: form.width === '' ? null : Number(form.width),
        height: form.height === '' ? null : Number(form.height),
        compositionItems: comp,
        collectionIds,
        images: galleryUploadedUrls,
      });

      navigate(`/products?kind=${isUpsell ? 'upsell' : 'main'}`);
    } catch (e) {
      setError(e?.data?.error || e?.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct() {
    if (mode !== 'edit') return;
    const ok = window.confirm('Удалить товар? Это действие необратимо.');
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.deleteProduct(id);
      if (cacheKey) removeCacheEntry(cacheKey);
      navigate(`/products?kind=${form.isUpsell ? 'upsell' : 'main'}`);
    } catch (e) {
      if (e?.status === 409 && String(e?.data?.error || '') === 'PRODUCT_HAS_ORDERS') {
        setError('Нельзя удалить товар: по нему есть заказы.');
      } else {
        setError(e?.data?.error || e?.message || 'Не удалось удалить товар');
      }
    } finally {
      setBusy(false);
    }
  }

  const canSave = Boolean(coverUrl) && !busy && !coverUploading && galleryUploadingCount === 0;

  const debugPayload = showDebug
    ? {
        buildId: '2026-02-10-gqfix5',
        mode,
        id,
        coverUrl,
        coverUploading,
        galleryUploadingCount,
        galleryCount: gallery.length,
        galleryUrls: gallery.map((g) => g.remoteUrl || g.url),
        formName: form.name,
        lastError: error || coverError || gallery.find((g) => g.status === 'error')?.error || '',
      }
    : null;

  return (
    <>
      <style>{'@keyframes progressStripes{0%{background-position:0 0;}100%{background-position:200% 0;}}'}</style>
      <div style={{ paddingBottom: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="ui-iconButton"
          style={{ background: 'var(--surface)' }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ textAlign: 'center', fontWeight: 1000, fontSize: 16 }}>
          {mode === 'new' ? 'Новый товар' : `Товар #${id}`}
        </div>
        <div />
      </div>

      {loading ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Загружаем…</Text>
          </Surface>
        </div>
      ) : error ? (
        <div style={{ marginTop: 16 }}>
          <Surface variant="soft" style={{ padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
            <Text variant="subtitle">Ошибка</Text>
            <div style={{ marginTop: 6 }}>
              <Text variant="body" muted>
                {error}
              </Text>
            </div>
          </Surface>
        </div>
      ) : (
        <>
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Фото</Text>

              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div>
                  <Text variant="caption">Обложка (обязательно)</Text>
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
	                    <div
	                      style={{
	                        width: 84,
	                        height: 84,
	                        borderRadius: 26,
	                        background: 'var(--c-ink-06)',
	                        overflow: 'hidden',
	                        border: '1px solid var(--border)',
	                        flexShrink: 0,
	                        position: 'relative',
	                      }}
	                      onClick={() => {
	                        if (coverUploading) return;
	                        if (coverPreviewUrl || coverUrl) openCoverCrop();
	                      }}
	                      onDragOver={(e) => e.preventDefault()}
	                      onDrop={(e) => {
	                        e.preventDefault();
	                        const f = e.dataTransfer?.files?.[0] || null;
                        pickCover(f);
                      }}
                    >
                      {coverPreviewUrl ? (
                        <AppImage src={coverPreviewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : coverUrl ? (
                        <AppImage src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : null}

                      {coverUploading ? (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'grid',
                            placeItems: 'center',
                            background: 'rgba(0,0,0,0.28)',
                            color: 'var(--c-white)',
                            fontWeight: 1000,
                            fontSize: 11,
                            textAlign: 'center',
                            padding: 6,
                          }}
                        >
                          Загрузка…
                        </div>
                      ) : null}

	                      {coverPreviewUrl || coverUrl ? (
	                        <button
	                          type="button"
	                          onClick={(e) => {
	                            e.stopPropagation();
	                            openCoverCrop();
	                          }}
	                          aria-label="Кадрировать"
	                          disabled={coverUploading}
	                          style={{
	                            position: 'absolute',
	                            top: 6,
	                            right: 6,
	                            width: 28,
	                            height: 28,
	                            borderRadius: 999,
	                            border: '1px solid var(--border)',
	                            background: 'rgba(0,0,0,0.55)',
	                            color: 'white',
	                            display: 'grid',
	                            placeItems: 'center',
	                            cursor: coverUploading ? 'default' : 'pointer',
	                            opacity: coverUploading ? 0.55 : 1,
	                          }}
	                        >
	                      <CropIcon size={14} />
	                    </button>
	                  ) : null}

	                  {coverPreviewUrl || coverUrl ? (
	                    <button
	                      type="button"
	                      onClick={(e) => {
	                        e.stopPropagation();
	                        if (coverUploading) return;
	                        const ok = window.confirm('Удалить обложку?');
	                        if (!ok) return;
	                        clearCover();
	                      }}
	                      aria-label="Удалить"
	                      disabled={coverUploading}
	                      style={{
	                        position: 'absolute',
	                        top: 6,
	                        left: 6,
	                        width: 28,
	                        height: 28,
	                        borderRadius: 999,
	                        border: '1px solid var(--border)',
	                        background: 'rgba(0,0,0,0.55)',
	                        color: 'white',
	                        display: 'grid',
	                        placeItems: 'center',
	                        cursor: coverUploading ? 'default' : 'pointer',
	                        opacity: coverUploading ? 0.55 : 1,
	                      }}
	                    >
	                      <X size={14} />
	                    </button>
	                  ) : null}
	                </div>

                <label
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 52,
                        borderRadius: 'var(--r-lg)',
                        border: '1px dashed var(--border)',
                        background: 'var(--surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        fontWeight: 900,
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer?.files?.[0] || null;
                        pickCover(f);
                      }}
                    >
                      <UploadCloud size={18} />
                      {coverUploading ? 'Загружаем…' : coverUrl || coverPreviewUrl ? 'Заменить обложку' : 'Загрузить обложку'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          e.target.value = '';
                          pickCover(f);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = e.dataTransfer?.files?.[0] || null;
                          pickCover(f);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  {coverError ? (
                    <div style={{ marginTop: 8 }}>
                      <Text variant="caption">{coverError}</Text>
                    </div>
                  ) : null}
                </div>

                <div style={{ borderTop: '1px solid var(--c-ink-06)', paddingTop: 12 }}>
                  <Text variant="caption">Галерея (опционально, drag для порядка)</Text>
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {coverUrl ? (
                      <div
                        style={{
                          width: 74,
                          height: 74,
                          borderRadius: 18,
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          position: 'relative',
                        }}
                        title="Обложка (основное фото)"
                      >
                        <AppImage
                          src={coverUrl}
                          alt=""
                          draggable={false}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            left: 6,
                            bottom: 6,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'rgba(0,0,0,0.55)',
                            color: 'white',
                            fontSize: 10,
                            fontWeight: 1000,
                          }}
                        >
                          cover
                        </div>
                      </div>
                    ) : null}
	                    {gallery.map((img) => (
	                      <ImageTile
	                        key={img.id}
	                        img={{
	                          ...img,
	                          canCrop: true,
	                          canDelete: true,
	                          onDelete: () => removeGalleryImage(img.id),
	                          onCrop: () => {
	                            const doCrop = async () => {
	                              try {
	                                let srcFile = img.file;
	                                if (!srcFile) {
                                  const srcUrl = img.remoteUrl || img.url;
                                  srcFile = await fetchFileFromUrl(srcUrl, `image-${img.id}.jpg`);
                                }
                                const cropped = await requestSquareCrop(srcFile, img.id);
                                setGalleryUploadingCount((c) => c + 1);
                                setGalleryAndRef(
                                  galleryRef.current.map((x) =>
                                    x.id === img.id ? { ...x, status: 'uploading', file: cropped, remoteUrl: '', url: x.url } : x,
                                  ),
                                );

                                try {
                                  const remoteUrl = await adminApi.uploadFile(cropped);
                                  const nextGallery = galleryRef.current.map((x) =>
                                    x.id === img.id ? { ...x, url: remoteUrl, remoteUrl, status: 'uploaded', file: null } : x,
                                  );
                                  setGalleryAndRef(nextGallery);
                                } catch {
                                  setGalleryAndRef(
                                    galleryRef.current.map((x) =>
                                      x.id === img.id ? { ...x, status: 'error' } : x,
                                    ),
                                  );
                                } finally {
                                  setGalleryUploadingCount((c) => Math.max(0, c - 1));
                                }
                              } catch {
                                // ignore
                              }
                            };
                            doCrop();
                          },
                        }}
                        onDragStart={() => {
                          dragId.current = img.id;
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = dragId.current;
                          const to = img.id;
                          dragId.current = null;
                          if (!from || from === to) return;
                          setGallery((prev) => {
                            const a = [...prev];
                            const fromIdx = a.findIndex((x) => x.id === from);
                            const toIdx = a.findIndex((x) => x.id === to);
                            if (fromIdx === -1 || toIdx === -1) return prev;
                            const [moved] = a.splice(fromIdx, 1);
                            a.splice(toIdx, 0, moved);
                            return a;
                          });
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label
                      style={{
                        width: '100%',
                        height: 52,
                        borderRadius: 'var(--r-lg)',
                        border: '1px dashed var(--border)',
                        background: 'var(--surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        fontWeight: 900,
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addGalleryFiles(e.dataTransfer?.files);
                      }}
                    >
                      <ImagePlus size={18} />
                      Добавить фото
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = '';
                          addGalleryFiles(files);
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          addGalleryFiles(e.dataTransfer?.files);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {galleryUploadingCount ? (
                      <div style={{ marginTop: 8 }}>
                        <Text variant="caption">Загружаем: {galleryUploadingCount}</Text>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Surface>

            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Цена</Text>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Апсейл">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isUpsell)}
                        onChange={(e) => setForm((p) => ({ ...p, isUpsell: e.target.checked }))}
                      />
                      Доп. товар
                    </label>
                  </Field>
                  <Field label="Сортировка апсейла">
                    <input
                      value={form.upsellSort}
                      onChange={(e) => setForm((p) => ({ ...p, upsellSort: e.target.value }))}
                      placeholder="0"
                      inputMode="numeric"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <Field label="Название">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Например, Наслаждение"
                    style={inputStyle}
                  />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Цена (₽)">
                    <input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                      placeholder="5428"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Скидка (₽, опц.)">
                    <input
                      type="number"
                      value={form.discount}
                      onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))}
                      placeholder="0"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                {Number(form.discount || 0) > 0 && Number(form.price || 0) > 0 ? (
                  <Text variant="caption">
                    Цена со скидкой: {Math.max(0, Number(form.price || 0) - Math.max(0, Number(form.discount || 0)))} ₽
                  </Text>
                ) : null}
              </div>
            </Surface>

            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Описание</Text>
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Ширина (см, опц.)">
                    <input
                      type="number"
                      value={form.width}
                      onChange={(e) => setForm((p) => ({ ...p, width: e.target.value }))}
                      placeholder="30"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Высота (см, опц.)">
                    <input
                      type="number"
                      value={form.height}
                      onChange={(e) => setForm((p) => ({ ...p, height: e.target.value }))}
                      placeholder="45"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Цвет (опц.)">
                    <input
                      value={form.color}
                      onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                      placeholder="Белый"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Время (опц.)">
                    <input
                      value={form.deliveryTime}
                      onChange={(e) => setForm((p) => ({ ...p, deliveryTime: e.target.value }))}
                      placeholder="45 мин"
                      style={inputStyle}
                    />
                  </Field>
                </div>

                <Field label="Теги (через запятую)">
                  <input
                    value={form.tags}
                    onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="розы, белые"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Описание (опц.)">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder={'Коротко и по делу.\n\nМожно вставлять списки:\n1) Заголовок\n• Пункт\n• Пункт'}
                    style={{ ...inputStyle, minHeight: 88, resize: 'vertical' }}
                  />
                  <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                    <Text variant="caption">
                      Поддерживаются списки: строки вида «1) Заголовок» и пункты «• Текст» будут красиво оформлены в карточке товара.
                    </Text>
                    {String(form.description || '').trim() ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Text variant="caption">Предпросмотр</Text>
                        <ProductDescription text={form.description} defaultOpen="all" />
                      </div>
                    ) : null}
                  </div>
                </Field>
              </div>
            </Surface>

            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Состав</Text>
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {compositionItems.map((it, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 92px', gap: 10, alignItems: 'center' }}>
                    <input
                      value={it.name}
                      onChange={(e) =>
                        setCompositionItems((prev) => prev.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="Напр. роза"
                      style={inputStyle}
                    />
                    <input
                      value={it.quantity}
                      onChange={(e) =>
                        setCompositionItems((prev) => prev.map((x, j) => (j === idx ? { ...x, quantity: e.target.value } : x)))
                      }
                      placeholder="15 шт"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setCompositionItems((prev) => prev.filter((_, j) => j !== idx))}
                      style={{
                        height: 46,
                        borderRadius: 'var(--r-lg)',
                        border: '1px solid var(--border)',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontWeight: 900,
                        color: 'var(--muted)',
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCompositionItems((prev) => [...prev, { name: '', quantity: '' }])}
                  style={{
                    height: 46,
                    borderRadius: 'var(--r-lg)',
                    border: '1px dashed var(--border)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                    fontWeight: 900,
                  }}
                >
                  + Добавить позицию
                </button>
              </div>
            </Surface>

            <Surface variant="soft" style={{ padding: 14, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <Text variant="subtitle">Подборки</Text>
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {(collections || []).length ? (
                  (collections || []).map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={collectionIds.includes(c.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCollectionIds((prev) => (checked ? Array.from(new Set([...prev, c.id])) : prev.filter((x) => x !== c.id)));
                        }}
                      />
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </span>
                      <span className="ui-chip" style={{ marginLeft: 'auto', borderColor: 'transparent', background: 'var(--surface)' }}>
                        {String(c.type) === 'scenario' ? 'SCENARIO' : 'COLLECTION'}
                      </span>
                    </label>
                  ))
                ) : (
                  <Text variant="body" muted>
                    Подборок пока нет.
                  </Text>
                )}
              </div>
            </Surface>
          </div>

          {!coverUrl ? (
            <div style={{ marginTop: 12 }}>
              <Text variant="caption">Нужно загрузить обложку, чтобы сохранить товар.</Text>
            </div>
          ) : null}

          {mode === 'edit' ? (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={deleteProduct}
                disabled={busy}
                style={{
                  width: '100%',
                  height: 46,
                  borderRadius: 'var(--r-lg)',
                  border: '1px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  fontWeight: 900,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                Удалить товар
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={canSave ? save : undefined}
            disabled={!canSave}
            style={{
	              position: 'fixed',
	              right: 'calc(var(--sp-4) + var(--app-inset-right))',
	              bottom: 'calc(var(--app-bottom-nav-space) + var(--app-nav-inset-bottom) - var(--app-keyboard-offset))',
	              height: 54,
	              padding: '0 18px',
	              borderRadius: 'var(--r-pill)',
	              border: 0,
              background: !canSave ? 'var(--c-ink-14)' : 'var(--text)',
              color: 'var(--c-white)',
              boxShadow: 'var(--shadow-2)',
              fontWeight: 900,
              cursor: !canSave ? 'default' : 'pointer',
              zIndex: 70,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              whiteSpace: 'nowrap',
              maxWidth: 'min(calc(100vw - 32px), 240px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <Save size={18} />
            {busy ? 'Сохраняем…' : 'Сохранить'}
	          </button>
	          {showDebug ? (
	            <button
	              type="button"
	              onClick={() => {
	                try {
	                  alert(JSON.stringify(debugPayload, null, 2));
	                } catch {
	                  // ignore
	                }
	              }}
	              style={{
	                position: 'fixed',
	                left: 'calc(var(--sp-4) + var(--app-inset-left))',
	                bottom: 'calc(var(--app-bottom-nav-space) + var(--app-nav-inset-bottom) - var(--app-keyboard-offset))',
	                height: 40,
	                padding: '0 14px',
	                borderRadius: 'var(--r-pill)',
	                border: '1px dashed var(--border)',
	                background: 'var(--surface)',
	                color: 'var(--text)',
	                boxShadow: 'var(--shadow-1)',
	                fontWeight: 800,
	                cursor: 'pointer',
	                zIndex: 71,
	                display: 'inline-flex',
	                alignItems: 'center',
	                gap: 8,
	                whiteSpace: 'nowrap',
	                maxWidth: 'min(calc(100vw - 32px), 200px)',
	                overflow: 'hidden',
	                textOverflow: 'ellipsis',
	              }}
	            >
	              Debug
	            </button>
	          ) : null}

	          {showDebug ? (
	            <div
	              style={{
	                marginTop: 20,
	                padding: 12,
	                border: '1px dashed var(--border)',
	                borderRadius: 12,
	                background: 'var(--surface)',
	              }}
	            >
	              <Text variant="caption" muted>
	                Debug
	              </Text>
	              <pre
	                style={{
	                  marginTop: 8,
	                  whiteSpace: 'pre-wrap',
	                  wordBreak: 'break-word',
	                  fontSize: 11,
	                  lineHeight: 1.3,
	                  background: 'var(--c-ink-10)',
	                  color: 'var(--c-white)',
	                  padding: 8,
	                  borderRadius: 8,
	                }}
	              >
	                {JSON.stringify(debugPayload, null, 2)}
	              </pre>
	            </div>
	          ) : null}

          <SquareCropModal
            open={cropOpen}
            imageSrc={cropSrc}
            onCancel={handleCropCancel}
            onConfirm={handleCropConfirm}
            title="Кадрирование"
            size={1024}
          />
        </>
      )}
      </div>
    </>
  );
}

export function ProductNewPage() {
  return <ProductForm mode="new" />;
}

export function ProductEditPage() {
  const params = useParams();
  const id = params.id;
  return <ProductForm mode="edit" id={id} />;
}
