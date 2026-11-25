'use strict';
// Runs in a one-off release image after migration. All fixtures use negative IDs
// and the entire transaction is intentionally rolled back; no SMS, bank, outbox,
// Telegram or customer data mutations are performed.
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {recordRegistrationGiftExposure,claimRegistrationGiftForVerifiedPhone,getRegistrationGiftStatus,fulfillRegistrationGift}=require('/app/services/registrationGift');
const p=new PrismaClient();
const uid=-226011260, beforeId=-226011261, afterId=-226011262;
const env={...process.env,FLOWIE_REGISTRATION_GIFT_ENABLED:'true',FLOWIE_REGISTRATION_GIFT_CAMPAIGN_ID:'qa-rollback-probe',FLOWIE_REGISTRATION_GIFT_TITLE:'Raffaello в подарок',FLOWIE_REGISTRATION_GIFT_BODY:'Коробка Raffaello 150 г к первому заказу после регистрации.',FLOWIE_REGISTRATION_GIFT_ITEM:'Raffaello 150 г',FLOWIE_REGISTRATION_GIFT_QUANTITY:'1',FLOWIE_REGISTRATION_GIFT_FULFILLMENT_MODE:'first_order',FLOWIE_REGISTRATION_GIFT_TERMS:'Коробка Raffaello 150 г к первому заказу после регистрации.',FLOWIE_REGISTRATION_GIFT_TERMS_VERSION:'qa-probe'};
let report;
(async()=>{
 assert.equal(await p.user.findUnique({where:{id:uid}}),null);
 for(const id of[beforeId,afterId])assert.equal(await p.order.findUnique({where:{id}}),null);
 try{
  await p.$transaction(async tx=>{
   const now=new Date();const claimedAt=new Date(now.getTime()-1000);
   let user=await tx.user.create({data:{id:uid,name:'QA rollback only'}});
   await recordRegistrationGiftExposure({prisma:tx,user,placement:'home',env,now:()=>new Date(now.getTime()-5000)});
   await recordRegistrationGiftExposure({prisma:tx,user,placement:'product',env});
   assert.equal(await tx.registrationGiftLedger.count({where:{userId:uid}}),1);
   user=await tx.user.update({where:{id:uid},data:{verifiedPhone:'+70000000000',phoneVerifiedAt:claimedAt}});
   const params={sourceUserId:uid,targetUserId:uid,verifiedPhone:user.verifiedPhone,newlyVerifiedAccount:true,env,now:()=>claimedAt};
   const gift=await claimRegistrationGiftForVerifiedPhone(tx,params);
   assert.ok(gift?.claimedAt);
   assert.equal((await claimRegistrationGiftForVerifiedPhone(tx,params)).id,gift.id);
   const disabled={...env,FLOWIE_REGISTRATION_GIFT_ENABLED:'false'};
   const status=await getRegistrationGiftStatus({prisma:tx,user,env:disabled});
   assert.equal(status.claimed,true);assert.match(status.campaign.body,/150/);
   await tx.order.create({data:{id:beforeId,userId:uid,status:'DELIVERED',paymentStatus:'CONFIRMED',paidAt:new Date(now.getTime()-2000),itemsTotal:100,totalPrice:100}});
   await tx.order.create({data:{id:afterId,userId:uid,status:'ASSEMBLED',paymentStatus:'CONFIRMED',paidAt:now,itemsTotal:100,totalPrice:100}});
   const adapter={$transaction:cb=>cb(tx)};
   assert.equal((await fulfillRegistrationGift({prisma:adapter,giftId:gift.id,orderId:beforeId})).error,'FIRST_PAID_ORDER_REQUIRED');
   assert.equal((await fulfillRegistrationGift({prisma:adapter,giftId:gift.id,orderId:afterId})).error,'ORDER_NOT_DELIVERED');
   await tx.order.update({where:{id:afterId},data:{status:'DELIVERED',deliveredAt:new Date()}});
   assert.equal((await fulfillRegistrationGift({prisma:adapter,giftId:gift.id,orderId:afterId})).replayed,false);
   assert.equal((await fulfillRegistrationGift({prisma:adapter,giftId:gift.id,orderId:afterId})).replayed,true);
   report={exposureOnce:true,claimOnce:true,disabledPreservesGift:true,preRegistrationPaymentExcluded:true,deliveryGate:true,fulfillmentOnce:true};
   throw Object.assign(new Error('EXPECTED_QA_ROLLBACK'),{qaRollback:true});
  },{timeout:20000});
 }catch(e){if(!e.qaRollback)throw e;}
 assert.equal(await p.user.findUnique({where:{id:uid}}),null);
 for(const id of[beforeId,afterId])assert.equal(await p.order.findUnique({where:{id}}),null);
 console.log(JSON.stringify({ok:true,...report,fixturesRolledBack:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
