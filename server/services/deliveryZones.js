const { geocode, MapsError } = require('./yandexMaps');
class DeliveryZoneError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code) => { throw new DeliveryZoneError(code); };
function cross(a, b, p) { return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]); }
function onSegment(a, b, p) {
  return Math.abs(cross(a,b,p)) < 1e-10 && p[0] >= Math.min(a[0],b[0])-1e-10 && p[0] <= Math.max(a[0],b[0])+1e-10 && p[1] >= Math.min(a[1],b[1])-1e-10 && p[1] <= Math.max(a[1],b[1])+1e-10;
}
function intersects(a,b,c,d) {
  return (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
}
// Coordinates are [latitude, longitude], matching Yandex JS API. One ring, no holes.
function normalizePolygon(value, active = false) {
  if (!Array.isArray(value) || value.length > 201) fail('ZONE_POLYGON_INVALID');
  const points = value.map(p => {
    if (!Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n)) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) fail('ZONE_POLYGON_INVALID');
    return p.map(n => Math.round(n * 1e7) / 1e7);
  });
  if (points.length > 1 && points[0].every((n,i) => n === points.at(-1)[i])) points.pop();
  if (!points.length && !active) return [];
  if (points.length < 3 || points.length > 200 || new Set(points.map(p=>p.join(','))).size !== points.length) fail('ZONE_POLYGON_INVALID');
  let area = 0;
  for (let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length]; area += a[0]*b[1]-b[0]*a[1];
    for (let j=i+1;j<points.length;j++) {
      if (j===i+1 || (i===0 && j===points.length-1)) continue;
      if (intersects(a,b,points[j],points[(j+1)%points.length])) fail('ZONE_POLYGON_INTERSECTS');
    }
  }
  if (Math.abs(area)<1e-10) fail('ZONE_POLYGON_INVALID');
  return points;
}
function validateZone(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).some(k=>!['name','price','conditions','priority','active','polygon'].includes(k))) fail('ZONE_INVALID');
  const name=typeof body.name==='string' ? body.name.trim() : '';
  const conditions=typeof body.conditions==='string' ? body.conditions.trim() : '';
  if (!name || name.length>80 || conditions.length>500) fail('ZONE_NAME_INVALID');
  if (typeof body.active !== 'boolean') fail('ZONE_INVALID');
  if (body.price !== null && (typeof body.price !== 'number' || !Number.isSafeInteger(body.price) || body.price<0 || body.price>100000)) fail('ZONE_PRICE_INVALID');
  if (body.active && body.price===null) fail('ZONE_PRICE_REQUIRED');
  if (!Number.isSafeInteger(body.priority) || body.priority<0 || body.priority>1000) fail('ZONE_PRIORITY_INVALID');
  return {name,conditions,price:body.price,priority:body.priority,active:body.active,polygon:normalizePolygon(body.polygon,body.active)};
}
function containsPoint(polygon, {lat,lon}) {
  if (!Array.isArray(polygon) || polygon.length<3 || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const p=[lat,lon]; let inside=false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j],b=polygon[i];
    if (onSegment(a,b,p)) return true;
    if ((a[1]>lon)!==(b[1]>lon) && lat < (b[0]-a[0])*(lon-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function chooseZone(zones, coords) {
  return [...zones].filter(z=>z.active && containsPoint(z.polygon,coords)).sort((a,b)=>a.priority-b.priority || a.id-b.id)[0] || null;
}
function publicStreetAddress(value) {
  // Do not send apartment, entrance, floor or free-form delivery notes to geocoding.
  return String(value || '').split(/,\s*(?:кв\.?|квартира|подъезд|этаж|домофон|комментарий)(?:\s|:|\d)/i)[0].trim().slice(0,300);
}
async function resolveDeliveryPrice({prisma,address,env=process.env,geocodeImpl=geocode}) {
  const settings = await prisma.deliverySettings.findUnique({where:{id:1}});
  if (settings?.mode !== 'zones') {
    const raw=String(env.DELIVERY_TARIFF_RUB ?? '').trim();
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new DeliveryZoneError('DELIVERY_TARIFF_NOT_CONFIGURED',503);
    return {price:Number(raw),provider:'configured_flat',coords:null};
  }
  const zones=await prisma.deliveryZone.findMany({orderBy:[{priority:'asc'},{id:'asc'}],take:101});
  if (zones.length>100) throw new DeliveryZoneError('DELIVERY_ZONES_LIMIT',503);
  if (!zones.some(z=>z.active)) throw new DeliveryZoneError('DELIVERY_ZONES_NOT_ACTIVE',503);
  const street=publicStreetAddress(address);
  if (street.length<6) throw new DeliveryZoneError('DELIVERY_ADDRESS_REQUIRED');
  let result;
  try { result=await geocodeImpl(street,{env}); }
  catch (e) { if (e instanceof MapsError) throw new DeliveryZoneError(e.code,e.status); throw e; }
  if (result.kind!=='house' || result.precision!=='exact') throw new DeliveryZoneError('DELIVERY_ADDRESS_NOT_PRECISE',422);
  const zone=chooseZone(zones,result.coords);
  if (!zone) throw new DeliveryZoneError('DELIVERY_OUTSIDE_ZONES',422);
  return {price:zone.price,zoneId:zone.id,zoneName:zone.name,conditions:zone.conditions,provider:'configured_zone',coords:result.coords};
}
module.exports={DeliveryZoneError,validateZone,normalizePolygon,containsPoint,chooseZone,resolveDeliveryPrice,publicStreetAddress};
