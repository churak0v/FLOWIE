import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Heart } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../state/AppState';
import { AppShell } from './layout/AppShell';
import { IconButton } from './ui/IconButton';
import { ProductGallery } from './domain/ProductGallery';
import { ProductInfo } from './domain/ProductInfo';
import { AlsoLikeSection } from './domain/AlsoLikeSection';
import { ProductAddBar } from './domain/ProductAddBar';
import { api } from '../api';
import { prefetchImages } from '../lib/prefetch';
import { readCacheEntry, writeCacheEntry, isCacheFresh } from '../lib/persistedCache';
import { Text } from './ui/Text';
import { toUiComposition, toUiSize } from '../lib/productUi';

export function ProductDetails() {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const { state, actions } = useAppState();

  const productFromList = useMemo(() => state.products.items.find((p) => p.id === productId) || null, [productId, state.products.items]);
  const [product, setProduct] = useState(productFromList);
  const [qty, setQty] = useState(1);
  const cacheKey = useMemo(() => (Number.isFinite(productId) ? `product_detail_v4_${productId}` : ''), [productId]);

  useEffect(() => {
    setProduct(productFromList);
  }, [productFromList]);

  useEffect(() => {
    if (!cacheKey || productFromList) return;
    const cached = readCacheEntry(cacheKey);
    if (cached?.data) {
      setProduct(cached.data);
      const imgs = cached.data?.images?.length ? cached.data.images : cached.data?.image ? [cached.data.image] : [];
      prefetchImages(imgs, { max: 24 });
    }
  }, [cacheKey, productFromList]);

  useEffect(() => {
    if (!productFromList || !cacheKey) return;
    writeCacheEntry(cacheKey, productFromList);
    const imgs = productFromList?.images?.length ? productFromList.images : productFromList?.image ? [productFromList.image] : [];
    prefetchImages(imgs, { max: 24 });
  }, [cacheKey, productFromList]);

  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(productId)) return;
    const hasFullGallery = Array.isArray(productFromList?.images) && productFromList.images.length > 1;
    if (productFromList && hasFullGallery) return;
    const cached = cacheKey ? readCacheEntry(cacheKey) : null;
    const cachedHasGallery = Array.isArray(cached?.data?.images) && cached.data.images.length > 1;
    if (cached?.data && cachedHasGallery && isCacheFresh(cached, 5 * 60_000)) return;
    api
      .getProduct(productId)
      .then((p) => {
        if (!alive || !p) return;
        const basePrice = Number(p.price || 0);
        const discount = Number(p.discount || 0);
        const finalPrice = Math.max(0, basePrice - discount);
        const cover = String(p.image || '').trim();
        const gallery = Array.isArray(p.images) ? p.images.map((x) => x?.url).filter(Boolean) : [];
        const images = [];
        const seen = new Set();
        for (const url of [cover, ...gallery]) {
          const u = String(url || '').trim();
          if (!u || seen.has(u)) continue;
          seen.add(u);
          images.push(u);
        }
        const next = {
          id: Number(p.id),
          title: String(p.name || ''),
          subtitle: '',
          price: finalPrice,
          basePrice,
          discount,
          image: cover || images[0] || '',
          images,
          description: p.description || '',
          composition: toUiComposition(p.composition),
          size: toUiSize(p.width, p.height),
          categoryId: p.categoryId ?? null,
        };
        setProduct(next);
        if (cacheKey) writeCacheEntry(cacheKey, next);
        prefetchImages(next.images?.length ? next.images : next.image ? [next.image] : [], { max: 24 });
      })
      .catch(() => {})
      .finally(() => {});
    return () => {
      alive = false;
    };
  }, [productFromList, productId]);

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
    const next = Math.max(1, qty - 1);
    if (inCart) actions.setCartQty(product.id, next);
    else setQty(next);
  };

  const handleInc = () => {
    if (!product) return;
    const next = Math.min(99, qty + 1);
    if (inCart) actions.setCartQty(product.id, next);
    else setQty(next);
  };

  return (
    <>
      <AppShell style={{ '--app-shell-bottom-space': '0px', '--app-shell-extra-bottom': '140px' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10 }}>
            <IconButton onClick={() => navigate(-1)} aria-label="Back">
              <ChevronLeft size={22} />
            </IconButton>
          </div>

          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
            <IconButton
              onClick={() => product && actions.toggleFavoriteProduct(product.id)}
              aria-label={isFavorite ? 'Remove from saved' : 'Save item'}
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

        <div style={{ marginTop: 'var(--sp-6)' }}>
          {product ? <ProductInfo product={product} /> : <Text variant="body" muted>Loading...</Text>}
        </div>

        {product ? <AlsoLikeSection productId={product.id} /> : null}
      </AppShell>

      <ProductAddBar
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
