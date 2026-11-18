const test=require('node:test');
const assert=require('node:assert/strict');
const {DeliveryZoneError,validateZone,containsPoint,chooseZone,resolveDeliveryPrice,publicStreetAddress}=require('../services/deliveryZones');
const square=[[56.8,53.1],[56.9,53.1],[56.9,53.3],[56.8,53.3]];
const base={name:'Центр',price:400,conditions:'В течение дня',priority:20,active:true,polygon:square};
function db(zones, mode = zones.length ? 'zones' : 'flat'){return {deliverySettings:{findUnique:async()=>({mode})},deliveryZone:{findMany:async()=>zones}};}
const geocoder=async()=>({kind:'house',precision:'exact',coords:{lat:56.85,lon:53.2}});
test('zone validation accepts explicit zero price and closed Yandex ring; incomplete drafts cannot be activated',()=>{
  assert.equal(validateZone({...base,price:0}).price,0);
  assert.deepEqual(validateZone({...base,polygon:[...square,square[0]]}).polygon,square);
  assert.deepEqual(validateZone({...base,active:false,price:null,polygon:[]}).polygon,[]);
  assert.throws(()=>validateZone({...base,price:null}),/ZONE_PRICE_REQUIRED/);
  for(const price of ['',-1,2.5,'500',undefined]) assert.throws(()=>validateZone({...base,price}),/ZONE_PRICE_INVALID/);
  assert.throws(()=>validateZone({...base,polygon:[]}),/ZONE_POLYGON_INVALID/);
  assert.throws(()=>validateZone({...base,active:'true'}),/ZONE_INVALID/);
  assert.throws(()=>validateZone({...base,admin:true}),/ZONE_INVALID/);
});
test('rejects bow-tie intersections, duplicate points, invalid coordinates and degenerate polygons',()=>{
  assert.throws(()=>validateZone({...base,polygon:[square[0],square[2],square[1],square[3]]}),/ZONE_POLYGON_INTERSECTS/);
  for(const polygon of [[[0,0],[0,1],[0,2]],[[91,0],[0,1],[1,1]],[[0,0],[0,1],[0,0],[1,1]]]) assert.throws(()=>validateZone({...base,polygon}),DeliveryZoneError);
});
test('point containment includes edges and vertices, excludes outside; overlap uses priority then oldest ID',()=>{
  assert.equal(containsPoint(square,{lat:56.85,lon:53.2}),true);
  assert.equal(containsPoint(square,{lat:56.8,lon:53.2}),true);
  assert.equal(containsPoint(square,{lat:56.8,lon:53.1}),true);
  assert.equal(containsPoint(square,{lat:57,lon:53.2}),false);
  const zones=[{...base,id:2},{...base,id:1},{...base,id:3,priority:1,active:false}];
  assert.equal(chooseZone(zones,{lat:56.85,lon:53.2}).id,1);
  assert.equal(chooseZone([...zones,{...base,id:9,priority:0}],{lat:56.85,lon:53.2}).id,9);
});
test('flat fallback exists only when there are no configured zones; disabled zones fail closed',async()=>{
  assert.equal((await resolveDeliveryPrice({prisma:db([]),env:{DELIVERY_TARIFF_RUB:'550'}})).price,550);
  await assert.rejects(resolveDeliveryPrice({prisma:db([]),env:{}}),/DELIVERY_TARIFF_NOT_CONFIGURED/);
  await assert.rejects(resolveDeliveryPrice({prisma:db([{...base,id:1,active:false}]),env:{DELIVERY_TARIFF_RUB:'550'}}),/DELIVERY_ZONES_NOT_ACTIVE/);
});
test('live zone price is resolved from server-geocoded house, never client coordinates; imprecise and outside addresses cannot fall back',async()=>{
  const args={prisma:db([{...base,id:1}]),address:'Ижевск, Пушкинская, 10, кв. 25, подъезд 2',env:{DELIVERY_TARIFF_RUB:'10'}};
  let sent;
  const quote=await resolveDeliveryPrice({...args,geocodeImpl:async address=>{sent=address;return geocoder();},coords:{lat:0,lon:0}});
  assert.equal(quote.price,400);assert.equal(quote.zoneId,1);assert.equal(sent,'Ижевск, Пушкинская, 10');
  await assert.rejects(resolveDeliveryPrice({...args,geocodeImpl:async()=>({...await geocoder(),precision:'near'})}),/DELIVERY_ADDRESS_NOT_PRECISE/);
  await assert.rejects(resolveDeliveryPrice({...args,geocodeImpl:async()=>({...await geocoder(),coords:{lat:60,lon:60}})}),/DELIVERY_OUTSIDE_ZONES/);
  assert.equal(publicStreetAddress('Ижевск, ул. Ленина, 15, этаж 3'),'Ижевск, ул. Ленина, 15');
});

test('draft zones never change flat mode; explicitly enabled zones mode with no zones fails closed',async()=>{
  const quote=await resolveDeliveryPrice({prisma:db([{...base,active:false}], 'flat'),env:{DELIVERY_TARIFF_RUB:'550'}});
  assert.equal(quote.price,550);
  await assert.rejects(resolveDeliveryPrice({prisma:db([], 'zones'),env:{DELIVERY_TARIFF_RUB:'550'}}),/DELIVERY_ZONES_NOT_ACTIVE/);
});
