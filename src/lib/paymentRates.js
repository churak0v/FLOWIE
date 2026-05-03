import { useEffect, useMemo, useState } from 'react';

const FALLBACK_TON_USD = 3.2;
const TON_USD_OVERRIDE = Number(import.meta.env.VITE_TON_USD_RATE || FALLBACK_TON_USD);
const STAR_BUY_USD = 0.01569;
const TON_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd';

let cachedTonUsd = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

function roundTon(value) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 100) return value.toFixed(1);
  if (value >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

export function convertUsdToStars(usd) {
  const amount = Math.max(0, Number(usd || 0));
  return Math.ceil(amount / STAR_BUY_USD);
}

export function convertUsdToTon(usd, tonUsd) {
  const amount = Math.max(0, Number(usd || 0));
  const rate = Number(tonUsd || FALLBACK_TON_USD);
  return rate > 0 ? amount / rate : 0;
}

export function formatTonAmount(value) {
  return `${roundTon(Number(value || 0))} TON`;
}

export function formatStarsAmount(value) {
  return `${Math.max(0, Math.ceil(Number(value || 0))).toLocaleString('en-US')} Stars`;
}

export function usePaymentQuote(usd) {
  const [tonUsd, setTonUsd] = useState(TON_USD_OVERRIDE || cachedTonUsd || FALLBACK_TON_USD);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    if (TON_USD_OVERRIDE > 0) {
      setTonUsd(TON_USD_OVERRIDE);
      setLive(false);
      return () => {
        alive = false;
      };
    }
    const now = Date.now();

    if (cachedTonUsd && now - cachedAt < CACHE_TTL_MS) {
      setTonUsd(cachedTonUsd);
      setLive(true);
      return () => {
        alive = false;
      };
    }

    fetch(TON_PRICE_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const next = Number(data?.['the-open-network']?.usd || 0);
        if (!alive || !Number.isFinite(next) || next <= 0) return;
        cachedTonUsd = next;
        cachedAt = Date.now();
        setTonUsd(next);
        setLive(true);
      })
      .catch(() => {
        if (!alive) return;
        setTonUsd(cachedTonUsd || FALLBACK_TON_USD);
        setLive(Boolean(cachedTonUsd));
      });

    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const ton = convertUsdToTon(usd, tonUsd);
    const stars = convertUsdToStars(usd);
    return {
      live,
      ton,
      tonUsd,
      stars,
      tonLabel: formatTonAmount(ton),
      starsLabel: formatStarsAmount(stars),
      rateLabel: live ? `1 TON ~ $${tonUsd.toFixed(2)}` : `1 TON ~ $${tonUsd.toFixed(2)}`,
    };
  }, [live, tonUsd, usd]);
}
