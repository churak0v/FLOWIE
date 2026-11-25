import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Heart, ArrowRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { ProductGallery } from './domain/ProductGallery';
import { ProductInfo } from './domain/ProductInfo';
import { ProductRecommendations } from './domain/ProductRecommendations';
import { Link } from 'react-router-dom';
import { ProductAddBar } from './domain/ProductAddBar';
import { api } from '../api';
import { readCacheEntry, writeCacheEntry } from '../lib/persistedCache';
import { Text } from './ui/Text';
import { toUiComposition, toUiSize } from '../lib/productUi';
import { trackAnalytics } from '../lib/analytics';
import { getProductFlowerCare } from '../data/flowerCare';
import { RegistrationGiftOffer } from './domain/RegistrationGiftOffer';

export function ProductDetails({ onLogin, registrationGift }) {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const productFromList = useMemo(() => state.products.items.find((p) => p.id === productId) || null, [productId, state.products.items]);
  const preloadedProductRef = useRef(productFromList);
  preloadedProductRef.current = productFromList;
  const [verifiedProductId, setVerifiedProductId] = useState(null);
  const [loadedProduct, setProduct] = useState(productFromList);
  const product = loadedProduct?.id === productId ? loadedProduct : productFromList;
  const [qty, setQty] = useState(1);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const cacheKey = useMemo(() => (Number.isFinite(productId) ? `product_detail_v7_local_images_${productId}` : ''), [productId]);

  useEffect(() => {
    if (!Number.isSafeInteger(productId) || productId < 1) {
      setProduct(null); setLoadError('not_found'); return;
    }
    let alive = true;
    const cached = readCacheEntry(cacheKey);
    setProduct(preloadedProductRef.current || cached?.data || null);
    setVerifiedProductId(null);
    setLoadError('');
    // Always revalidate: a cached gallery must not keep a hidden product buyable.
    api.getProduct(productId, { fresh: true }).then((p) => {
      if (!alive || !p) return;
      const basePrice = Number(p.price || 0);
      const discount = Number(p.discount || 0);
      const images = [...new Set([p.image, ...(p.images || []).map(x => x.url)].filter(Boolean))];
      const next = {
        id: Number(p.id), title: String(p.name || ''), subtitle: '',
        price: Math.max(0, basePrice - discount), basePrice, discount,
        image: p.image || images[0] || '', images,
        description: p.description || '', composition: toUiComposition(p.composition),
        compositionItems: p.composition, size: toUiSize(p.width, p.height),
        width: p.width, height: p.height, categoryId: p.categoryId ?? null,
      };
      setProduct(next); writeCacheEntry(cacheKey, next);
      actions.syncProductDetail(next);
      setVerifiedProductId(productId);
    }).catch(error => {
      if (!alive) return;
      setLoadError(error.status === 404 ? 'not_found' : 'unavailable');
      if (error.status === 404) { setProduct(null); actions.markProductUnavailable(productId); }
    });
    return () => { alive = false; };
  }, [actions, cacheKey, productId, retry]);

  useEffect(() => {
    if (Number.isSafeInteger(productId) && productId > 0) {
      trackAnalytics('product_view', { productId, meta: { path: `/product/${productId}` } }, { dedupeKey: productId });
    }
  }, [productId]);

  const care = useMemo(() => getProductFlowerCare(product), [product]);

  const cartItem = useMemo(
    () => state.cart.items.find((it) => Number(it.productId) === Number(productId)) || null,
    [productId, state.cart.items]
  );
  const inCart = Boolean(cartItem);
  const sum = (product?.price || 0) * qty;
  const isFavorite = product ? state.favorites.productIds.includes(product.id) : false;

  useEffect(() => {
    setQty(cartItem ? Math.max(1, Math.min(99, Number(cartItem.qty || 1))) : 1);
  }, [cartItem, productId]);

  const handleAdd = () => {
    if (!product) return;
    actions.addToCart(product.id, qty);
  };

  const handleDec = () => {
    if (!product) return;
    if (inCart && qty === 1) { actions.removeFromCart(product.id); return; }
    const next = Math.max(1, qty - 1);
    if (inCart) {
      if (next < qty) trackAnalytics('cart_remove', { productId: product.id, meta: { quantity: qty - next } });
      actions.setCartQty(product.id, next);
    }
    else setQty(next);
  };

  const handleInc = () => {
    if (!product) return;
    const next = Math.min(99, qty + 1);
    if (inCart) {
      if (next > qty) trackAnalytics('cart_add', { productId: product.id, meta: { quantity: next - qty } });
      actions.setCartQty(product.id, next);
    }
    else setQty(next);
  };

  return (
    <>
      <AppShell style={{ paddingLeft: 0, paddingRight: 0, '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '100px' }}>
        <div data-analytics-section="gallery" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
              <ChevronLeft size={22} />
            </IconButton>
          </div>

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <IconButton
              onClick={() => {
                if (!product) return;
                trackAnalytics(isFavorite ? 'favorite_remove' : 'favorite_add', { productId: product.id });
                actions.toggleFavoriteProduct(product.id);
              }}
              aria-label={isFavorite ? 'Убрать из сохранённого' : 'Сохранить'}
              style={{
                background: isFavorite ? 'var(--c-accent-10)' : undefined,
              }}
            >
              <Heart
                size={20}
                strokeWidth={2.5}
                color={isFavorite ? 'var(--accent)' : 'var(--c-ink-92)'}
                fill={isFavorite ? 'var(--accent)' : 'none'}
              />
            </IconButton>
          </div>

          <ProductGallery title={product?.title || ''} images={product?.images?.length ? product.images : product?.image ? [product.image] : []} />
        </div>

        <div style={{ padding: '22px var(--sp-4) 12px' }}>
          {loadError ? <div role="status" style={{ padding: 16, marginBottom: 16, background: '#fff', borderRadius: 16, lineHeight: 1.45 }}>
            {loadError === 'not_found' ? 'Этот букет сейчас недоступен. Посмотрите другие варианты в каталоге.' : 'Не удалось обновить данные букета. Проверьте соединение и попробуйте ещё раз.'}
            {loadError !== 'not_found' ? <button type="button" onClick={() => setRetry(value => value + 1)} style={{ display: 'block', marginTop: 10 }}>Повторить</button> : <Link to="/catalog" style={{ display: 'block', marginTop: 10 }}>Выбрать другой букет</Link>}
          </div> : null}
          {product?.id === productId ? <ProductInfo product={product} /> : !loadError ? <Text variant="body" muted>Загружаем букет…</Text> : null}

          {product?.id === productId ? <>
            <div data-analytics-section="promotion">
              <RegistrationGiftOffer status={registrationGift?.status} user={state.auth.me} placement="product_details" onExpose={registrationGift?.onExpose} onRefresh={registrationGift?.onRefresh} onLogin={onLogin} />
            </div>
            <section data-analytics-section="care" style={{ marginTop: 24, padding: 18, borderRadius: 22, background: '#eef3ed' }}>
              <div style={{ fontSize: 11, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '.07em', color: '#57705a' }}>После вручения</div>
              <h2 style={{ margin: '8px 0', fontSize: 22, letterSpacing: '-.025em' }}>Чтобы цветы радовали дольше</h2>
              <p style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>{care.primary.lead}</p>
              <p style={{fontSize: 14, lineHeight: 1.5, margin: '0 0 14px', fontWeight: 700}}>{care.primary.water}</p>
              <Link to={`/care?flower=${encodeURIComponent(care.primary.key)}`} data-analytics-element="care_open" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, color: '#36533c', fontWeight: 850, fontSize: 14 }}>Уход за моими цветами <ArrowRight size={18} /></Link>
            </section>
            <section data-analytics-section="motivation" style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 22 }}>
              <h2 style={{ fontSize: 22, lineHeight: 1.15, letterSpacing: '-.025em', margin: '0 0 8px' }}>Вы выбираете. Мы покажем результат.</h2>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>Соберём букет и пришлём его фото перед передачей курьеру — вы увидите, что отправится вашему близкому человеку.</p>
            </section>
            <ProductRecommendations product={product} />
          </> : null}
        </div>
      </AppShell>

      <ProductAddBar
        disabled={!product || product.id !== productId || verifiedProductId !== productId || Boolean(loadError)}
        qty={qty}
        onDec={handleDec}
        onInc={handleInc}
        sum={sum}
        added={inCart}
        onAdd={handleAdd}
        onViewCart={() => navigate('/cart')}
      />
    </>
  );
}
