const express=require('express');
const {DeliveryZoneError,validateZone}=require('../services/deliveryZones');
module.exports=function adminDeliveryZones({prisma,writeAudit}) {
  const router=express.Router();
  router.get('/',async(req,res)=>{
    try {res.json({ok:true,mode:(await prisma.deliverySettings.findUnique({where:{id:1}}))?.mode || 'flat',zones:await prisma.deliveryZone.findMany({orderBy:[{priority:'asc'},{id:'asc'}]})});}
    catch {res.status(500).json({ok:false,error:'DELIVERY_ZONES_FAILED'});}
  });
  router.put('/mode',async(req,res)=>{
    const mode=req.body?.mode;
    if(!['flat','zones'].includes(mode) || Object.keys(req.body || {}).some(k=>k!=='mode')) return res.status(400).json({ok:false,error:'DELIVERY_MODE_INVALID'});
    try {
      if(mode==='zones' && !await prisma.deliveryZone.count({where:{active:true}})) return res.status(409).json({ok:false,error:'DELIVERY_ZONES_NOT_ACTIVE'});
      const settings=await prisma.deliverySettings.upsert({where:{id:1},create:{id:1,mode},update:{mode}});
      await writeAudit({actorId:req.admin.id,action:'DELIVERY_MODE_CHANGED',entity:'deliverySettings',entityId:1,payload:{mode}});
      res.json({ok:true,mode:settings.mode});
    }catch {res.status(500).json({ok:false,error:'DELIVERY_MODE_SAVE_FAILED'});}
  });
  async function save(req,res) {
    try {
      const id=req.params.id==null?null:Number(req.params.id);
      if(id!==null && (!Number.isSafeInteger(id)||id<=0)) throw new DeliveryZoneError('BAD_ID');
      const data=validateZone(req.body);
      const zone=await prisma.$transaction(async tx=>{
        // Serialize bounded creation across simultaneous administrator requests.
        await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(18112026)::text');
        if(id===null && await tx.deliveryZone.count()>=100) throw new DeliveryZoneError('DELIVERY_ZONES_LIMIT',409);
        return id===null?tx.deliveryZone.create({data}):tx.deliveryZone.update({where:{id},data});
      });
      await writeAudit({actorId:req.admin.id,action:'DELIVERY_ZONE_SAVED',entity:'deliveryZone',entityId:zone.id,payload:{active:zone.active,price:zone.price}});
      res.status(id===null?201:200).json({ok:true,zone});
    }catch(e){res.status(e instanceof DeliveryZoneError?e.status:e.code==='P2025'?404:500).json({ok:false,error:e instanceof DeliveryZoneError?e.code:e.code==='P2025'?'NOT_FOUND':'DELIVERY_ZONE_SAVE_FAILED'});}
  }
  router.post('/',save); router.put('/:id',save);
  router.delete('/:id',async(req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({ok:false,error:'BAD_ID'});
    try {
      await prisma.deliveryZone.delete({where:{id}});
      await writeAudit({actorId:req.admin.id,action:'DELIVERY_ZONE_DELETED',entity:'deliveryZone',entityId:id});
      res.json({ok:true});
    }catch(e){res.status(e.code==='P2025'?404:500).json({ok:false,error:e.code==='P2025'?'NOT_FOUND':'DELIVERY_ZONE_DELETE_FAILED'});}
  });
  return router;
};
