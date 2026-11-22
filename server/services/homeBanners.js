'use strict';

const BANNER_IDS = ['mother', 'birthday', 'premium'];

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validHref(value) {
  const href = String(value || '').trim();
  if (!href || href.length > 300 || !href.startsWith('/') || href.startsWith('//') || /[\s\\]/.test(href)) return false;
  let url;
  try { url = new URL(href, 'https://flowie.art'); } catch { return false; }
  if (url.origin !== 'https://flowie.art' || url.hash) return false;
  if (!['/catalog', '/shop'].includes(url.pathname) && !/^\/product\/[1-9]\d*$/.test(url.pathname)) return false;
  const allowed = new Set(['collection', 'scenario', 'min', 'max', 'sort', 'search', 'flower', 'view']);
  for (const param of url.searchParams.keys()) if (!allowed.has(param)) return false;
  return true;
}

function validImage(value) {
  const image = String(value || '').trim();
  return image.length <= 500 && !image.includes('..') && (
    /^\/uploads\/[a-f0-9-]+\.(?:jpe?g|png|webp|gif)$/i.test(image) ||
    /^\/(?:hero|upsells|assets)\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(image)
  );
}

function normalizeBanner(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('BANNER_INVALID');
  const keys = ['caption','subtitle','image','href','imagePosition','sort','isActive'];
  if (Object.keys(data).some(key => !keys.includes(key))) fail('BANNER_INVALID');
  const caption = typeof data.caption === 'string' ? data.caption.trim() : '';
  const subtitle = typeof data.subtitle === 'string' ? data.subtitle.trim() : '';
  const image = typeof data.image === 'string' ? data.image.trim() : '';
  const href = typeof data.href === 'string' ? data.href.trim() : '';
  const imagePosition = typeof data.imagePosition === 'string' ? data.imagePosition.trim() : '';
  if (!caption || caption.length > 100 || subtitle.length > 220) fail('BANNER_TEXT_INVALID');
  if (!validImage(image)) fail('BANNER_IMAGE_INVALID');
  if (!validHref(href)) fail('BANNER_HREF_INVALID');
  if (!/^(?:center|left|right|\d{1,3}%)(?: (?:top|center|bottom|\d{1,3}%))?$/.test(imagePosition)) fail('BANNER_POSITION_INVALID');
  if (!Number.isSafeInteger(data.sort) || data.sort < 0 || data.sort > 1000) fail('BANNER_SORT_INVALID');
  if (typeof data.isActive !== 'boolean') fail('BANNER_ACTIVE_INVALID');
  return {caption, subtitle, image, href, imagePosition, sort:data.sort, isActive:data.isActive};
}

function publicBanner(row) {
  return {id:row.id, caption:row.caption, subtitle:row.subtitle,
    image:row.image, href:row.href, imagePosition:row.imagePosition};
}

module.exports = { BANNER_IDS, validHref, validImage, normalizeBanner, publicBanner };
