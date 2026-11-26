import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { api } from '../api.js';
import { ANALYTICS_OPT_OUT_KEY, extractAnalyticsAttribution } from './analytics.js';
const { normalizeOrderRequest } = createRequire(import.meta.url)('../../server/services/orderCreation');
function storage() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,String(v)), removeItem: k => m.delete(k) }; }
function setup({ optOut = false, dnt = false } = {}) {
  const saved = new Map();
  const values = { localStorage: storage(), sessionStorage: storage(), navigator: { doNotTrack: dnt ? '1' : '0' }, location: { pathname: '/checkout', hostname: 'flowie.art', search: '?utm_source=vk_ads&utm_medium=cpc&utm_campaign=42462003&utm_content=255154846&mt_click_id=opaque_click_1' }, document: { referrer: '' } };
  let sent;
  values.fetch = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ id: 42 }) }; };
  for (const [key,value] of Object.entries(values)) { saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value}); }
  if (optOut) values.localStorage.setItem(ANALYTICS_OPT_OUT_KEY,'1');
  return { sent: () => sent, restore: () => { for (const [key,descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]; } } };
}
function order() { return { checkoutKey: '3f85a2ac-4192-4f81-b2f4-73a689cb61f7', items: [{productId:139,quantity:1}], deliveryAddress:'Ижевск, улица Цветочная, 10', recipientName:'Получатель',recipientPhone:'+79990000001',senderPhone:'+79990000002',consentPersonal:true }; }

test('real POST body connects checkout with the visit and survives backend normalization', async () => {
  const env=setup();try {
    const input=order();await api.createOrder(input);const {url,body}=env.sent();
    assert.equal(url,'/api/orders');assert.equal(body.items[0].productId,139);assert.ok(body.analytics.sessionId);
    assert.equal(body.analytics.attribution.utm_campaign,'42462003');assert.equal(body.analytics.attribution.utm_content,'255154846');
    const normalized=normalizeOrderRequest(body);assert.equal(normalized.analytics.sessionId,body.analytics.sessionId);
    assert.equal(normalized.analytics.attribution.trafficChannel,'paid_social');assert.match(normalized.analytics.attribution.mt_click_idHash,/^[a-f0-9]{64}$/);
    assert.doesNotMatch(JSON.stringify(normalized.analytics),/opaque_click_1|Получатель|79990000001/);assert.equal(input.analytics,undefined);
  } finally {env.restore();}
});
for (const mode of ['optOut','dnt']) test(`${mode} omits tracking even if a caller supplied it`, async () => {
  const env=setup({[mode]:true});try {await api.createOrder({...order(),analytics:{sessionId:'caller_tracking',attribution:{utm_source:'injected'}}});assert.equal(env.sent().body.analytics,undefined);}finally{env.restore();}
});
test('Yandex static creative labels survive landing to checkout after query disappears', async () => {
  for (const creative of ['red_duet_search','angel_duet_search']) {
    const env=setup();try {
      Object.assign(globalThis.location,{pathname:'/',search:`?offer=red-duet&utm_source=yandex&utm_medium=cpc&utm_campaign=premium_pairs_a&utm_content=${creative}&yclid=opaque_search_click`});
      extractAnalyticsAttribution();
      Object.assign(globalThis.location,{pathname:'/checkout',search:''});
      await api.createOrder(order());const normalized=normalizeOrderRequest(env.sent().body);
      assert.equal(normalized.analytics.attribution.utm_campaign,'premium_pairs_a');
      assert.equal(normalized.analytics.attribution.utm_content,creative);
      assert.equal(normalized.analytics.attribution.trafficChannel,'paid_search');
      assert.match(normalized.analytics.attribution.yclidHash,/^[a-f0-9]{64}$/);
    }finally{env.restore();}
  }
});
