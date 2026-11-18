import { useEffect, useState } from 'react';
import { api } from '../api';

// Match each result to the exact request so slow responses cannot replace newer filters.
export function useCatalogSearch({ query, minPrice, maxPrice, collection, scenario }) {
  const text = String(query || '').trim();
  const requestKey = JSON.stringify({
    query: text.slice(0, 160),
    minPrice: minPrice == null || minPrice === '' ? null : Number(minPrice),
    maxPrice: maxPrice == null || maxPrice === '' ? null : Number(maxPrice),
    collection: collection || null,
    scenario: scenario || null,
    limit: 100,
  });
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (text.length < 2) return undefined;
    const controller = new AbortController();
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.searchCatalog(JSON.parse(requestKey), { signal: controller.signal });
        if (!alive) return;
        if (!Array.isArray(data?.productIds)) throw new Error('SEARCH_RESPONSE_INVALID');
        setResult({ key: requestKey, data });
      } catch (error) {
        if (alive) setResult({ key: requestKey, data: error?.data?.error === 'PRICE_RANGE_EMPTY'
          ? { productIds: [], mode: 'lexical', indexReady: false }
          : null });
      }
    }, 350);
    return () => { alive = false; window.clearTimeout(timer); controller.abort(); };
  }, [requestKey, text.length]);

  const current = text.length >= 2 && result?.key === requestKey ? result : null;
  return { data: current?.data || null, loading: text.length >= 2 && !current };
}
