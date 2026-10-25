import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createLocalStore}=require('../local-services/store.cjs');
async function setup(t){const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-store-'));const store=createLocalStore({dataDir,seed:false,autoBackup:false});await store.initialize();t.after(async()=>{await store.checkpointAndClose();fs.rmSync(dataDir,{recursive:true,force:true});});return store;}
const ingest=(s,messageId='m1',text='hi')=>s.dispatch('whatsapp.message.ingest',{accountId:'a',conversationHash:'hash',messageId,text,encryptedReplyTarget:'cipher'});
async function createDraft(s, method='pickup'){await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Item',quantity:10}});await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Item',price:5,isActive:true}});const r=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:1,notes:'no salt'}],orderDetails:{deliveryMethod:method,address:method==='delivery'?'street 1':null},customerPhone:'+1000'});return r.draft;}
test('SQLite migration, consent shape and exact current-consent gate',async t=>{const s=await setup(t);assert.deepEqual(await s.dispatch('whatsapp.agent.settings.get'),{enabled:false,consentVersion:null,consentAcceptedAt:null});assert.equal((await s.dispatch('whatsapp.agent.settings.set',{enabled:true})).enabled,false);const v=await s.dispatch('whatsapp.agent.settings.set',{enabled:true,consentVersion: '2'});assert.deepEqual(Object.keys(v).sort(),['consentAcceptedAt','consentVersion','enabled']);assert.equal(v.enabled,true);const migrations=await s.prisma.$queryRawUnsafe('SELECT name FROM _LocalMigrations LIMIT 20');assert.ok(migrations.some(x=>x.name==='20261025010000_whatsapp_agent'));});
test('logical-message duplicate key, claims, safe reply outbox and restart recovery',async t=>{const s=await setup(t);const rs=await Promise.all(Array.from({length:8},()=>ingest(s)));assert.equal(rs.filter(x=>!x.duplicate).length,1);assert.equal(rs.filter(x=>x.duplicate).length,7);assert.ok(rs[0].messageId);assert.deepEqual(await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'m1'}),{claimed:true});assert.equal((await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'m1'})).claimed,false);await s.prisma.localWhatsAppMessage.updateMany({where:{messageId:'m1'},data:{updatedAt:BigInt(Date.now()-600001)}});assert.deepEqual(await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'m1'}),{claimed:true});const p=await s.dispatch('whatsapp.message.reply.prepare',{accountId:'a',conversationHash:'hash',messageId:'m1',encryptedReplyTarget:'enc',replyText:'hello'});assert.equal(p.replyStatus,'pending');assert.equal((await s.dispatch('whatsapp.message.reply.prepare',{accountId:'a',conversationHash:'hash',messageId:'m1',encryptedReplyTarget:'other',replyText:'changed'})).duplicate,true);const claimed=await s.dispatch('whatsapp.message.reply.claim',{replyId:p.replyId});assert.equal(claimed.replyStatus,'sending');assert.equal((await s.dispatch('whatsapp.message.reply.pending')).length,0);await s.dispatch('whatsapp.message.reply.recover');assert.equal((await s.dispatch('whatsapp.message.reply.pending')).length,0);assert.equal((await s.prisma.localWhatsAppMessage.findFirst({where:{replyId:p.replyId}})).replyStatus,'unknown');});
test('startup recovery lists only received or stale processing messages without a prepared reply',async t=>{
  const s=await setup(t);await s.dispatch('whatsapp.agent.settings.set',{enabled:true,consentVersion: '2'});
  await ingest(s,'received');
  await ingest(s,'stale');await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'stale'});
  await s.prisma.localWhatsAppMessage.updateMany({where:{messageId:'stale'},data:{updatedAt:BigInt(Date.now()-300001)}});
  await ingest(s,'fresh');await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'fresh'});
  await ingest(s,'reply-ready');await s.dispatch('whatsapp.message.reply.prepare',{accountId:'a',conversationHash:'hash',messageId:'reply-ready',encryptedReplyTarget:'cipher-target',replyText:'ready'});
  await s.prisma.localWhatsAppMessage.updateMany({where:{messageId:'reply-ready'},data:{updatedAt:BigInt(Date.now()-600001)}});
  const recoverable=await s.dispatch('whatsapp.message.recoverable',{});
  assert.deepEqual(recoverable.map(row=>row.messageId).sort(),['received','stale']);
  await s.dispatch('whatsapp.agent.settings.set',{enabled:false,consentVersion: '2'});
  assert.deepEqual(await s.dispatch('whatsapp.message.recoverable',{}),[]);
});
test('draft CAS rejects stale confirmation after item edits and confirms the current version atomically',async t=>{
  const s=await setup(t);await ingest(s);
  await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Item',quantity:3}});
  await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Item',price:5}});
  await s.dispatch('coupons.save',{couponData:{id:'cp',code:'SAVE',discountType:'fixed',discountValue:1,isActive:true}});
  const first=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:2}],orderDetails:{deliveryMethod:'pickup',couponCode:'SAVE'},customerPhone:'123'});
  const stale=first.draft;assert.equal(stale.data.summary.total,9);
  assert.equal((await s.dispatch('whatsapp.draft.awaiting',{draftId:stale.id,expectedVersion:stale.version})).conflict,false);
  assert.equal((await s.dispatch('whatsapp.draft.awaiting',{draftId:stale.id,expectedVersion:stale.version})).conflict,true);
  const changed=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:1}],orderDetails:{deliveryMethod:'pickup',couponCode:'SAVE'},customerPhone:'123'});
  assert.equal(changed.draft.version,stale.version+1);
  const oldConfirmation={accountId:'a',conversationHash:'hash',draftId:stale.id,expectedVersion:stale.version,customerPhone:'123',confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'};
  await assert.rejects(s.dispatch('whatsapp.draft.confirm',oldConfirmation),error=>error.code==='STALE_SUMMARY');
  assert.equal(await s.prisma.localOrder.count(),0);
  assert.equal((await s.dispatch('inventory.get')).stockList.find(x=>x.id==='item1').quantity,3);
  assert.equal(await s.prisma.localCouponUsage.count(),0);
  const current=changed.draft;
  assert.equal((await s.dispatch('whatsapp.draft.awaiting',{draftId:current.id,expectedVersion:current.version})).conflict,false);
  const confirmation={...oldConfirmation,expectedVersion:current.version};
  const out=await s.dispatch('whatsapp.draft.confirm',confirmation);
  assert.equal(out.order.source,'WHATSAPP');assert.equal(out.order.summary.discount,1);assert.equal(out.order.summary.total,4);
  assert.equal(await s.prisma.localOrder.count({where:{draftId:current.id,source:'WHATSAPP'}}),1);
  assert.equal((await s.dispatch('inventory.get')).stockList.find(x=>x.id==='item1').quantity,2);
  assert.equal(await s.prisma.localCouponUsage.count({where:{orderId:out.order.id}}),1);
  assert.equal((await s.prisma.localWhatsAppMessage.findFirst({where:{messageId:'m1'}})).replyStatus,'waiting_print');
  const replay=await s.dispatch('whatsapp.draft.confirm',confirmation);
  assert.equal(replay.order.id,out.order.id);assert.equal(replay.replay,true);
  assert.equal(await s.prisma.localPrintJob.count({where:{orderId:out.order.id}}),2);
});
test('delivery needs an address and configured fee; pickup print lifecycle unlocks truthful reply',async t=>{
  const s=await setup(t);await ingest(s);
  await s.dispatch('inventory.saveStock',{stock:{id:'item1',quantity:4}});
  await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Item',price:2}});
  const bad=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'missing',quantity:1},{itemId:'item1',quantity:1.5}],orderDetails:{deliveryMethod:'delivery'}});
  assert.equal(bad.rejectedItems.length,2);
  const missing=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:1}],orderDetails:{deliveryMethod:'delivery'}});
  assert.equal(missing.needsAddress,true);assert.equal(missing.needsDeliveryFee,true);
  const delivery=await createDraft(s,'delivery');assert.equal(delivery.data.needsDeliveryFee,true);
  await s.dispatch('whatsapp.draft.awaiting',{draftId:delivery.id,expectedVersion:delivery.version});
  await assert.rejects(s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:delivery.id,expectedVersion:delivery.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'}),error=>error.code==='DELIVERY_FEE_UNAVAILABLE');
  assert.equal(await s.prisma.localOrder.count(),0);

  const pickup=await createDraft(s,'pickup');assert.equal(pickup.data.needsDeliveryFee,false);
  await s.dispatch('whatsapp.draft.awaiting',{draftId:pickup.id,expectedVersion:pickup.version});
  const o=(await s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:pickup.id,expectedVersion:pickup.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'})).order;
  const jobs=await s.dispatch('whatsapp.print.pending');assert.equal(jobs.filter(j=>j.orderId===o.id).length,2);assert.ok(jobs[0].order.items.length);
  for(const j of jobs.filter(x=>x.orderId===o.id)){assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:j.id}),true);await s.dispatch('whatsapp.print.complete',{jobId:j.id,status:'printed'});}
  assert.equal((await s.prisma.localWhatsAppMessage.findFirst({where:{messageId:'m1'}})).replyStatus,'pending');
  assert.match((await s.dispatch('whatsapp.message.reply.pending'))[0].replyText,/AURA-/);
  const first=jobs.find(j=>j.orderId===o.id);await s.dispatch('whatsapp.print.claim',{jobId:first.id});await s.dispatch('whatsapp.print.recover');assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:first.id}),false);
});
test('draft validation rejects exhausted direct stock and recipe ingredients before summary',async t=>{
  const s=await setup(t);await ingest(s);
  await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Direct',quantity:1}});
  await s.dispatch('inventory.saveStock',{stock:{id:'ingredient1',name:'Ingredient',quantity:1}});
  await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Direct',price:5,isActive:true}});
  await s.dispatch('menu.saveItem',{itemData:{id:'weight1',name:'Weight item',price:4,isActive:true,isWeightBased:true}});
  await s.dispatch('menu.saveItem',{itemData:{id:'meal1',name:'Meal',price:10,isActive:true}});
  await s.dispatch('inventory.registerMenu',{items:[{id:'meal1',recipe:[{inventoryItemId:'ingredient1',quantity:2}]}]});
  const result=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:2},{itemId:'meal1',quantity:1},{itemId:'weight1',quantity:1}],orderDetails:{deliveryMethod:'pickup'}});
  assert.equal(result.draft.data.items.length,0);
  assert.deepEqual(result.rejectedItems.map(item=>item.reason).sort(),['unavailable_stock','unavailable_stock','unsupported_weight_based']);
  assert.equal(result.draft.data.summary.total,0);
});

test('stock exhausted after summary rolls back the confirmation transaction',async t=>{
  const s=await setup(t);await ingest(s);
  await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Item',quantity:1}});
  await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Item',price:5}});
  const draft=(await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:1}],orderDetails:{deliveryMethod:'pickup'}})).draft;
  await s.dispatch('whatsapp.draft.awaiting',{draftId:draft.id,expectedVersion:draft.version});
  await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Item',quantity:0}});
  await assert.rejects(s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:draft.id,expectedVersion:draft.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'}),error=>error.code==='INSUFFICIENT_STOCK');
  assert.equal(await s.prisma.localOrder.count(),0);
  assert.equal(await s.prisma.localPrintJob.count(),0);
  assert.equal((await s.prisma.localWhatsAppDraft.findUnique({where:{id:draft.id}})).status,'awaiting_confirmation');
  assert.equal((await s.dispatch('inventory.get')).stockList.find(x=>x.id==='item1').quantity,0);
});

test('handoff/resume, masked conversation listing and cleanup preserves real order',async t=>{const s=await setup(t);await ingest(s);const d=await createDraft(s);await s.dispatch('whatsapp.draft.awaiting',{draftId:d.id,expectedVersion:d.version});const o=(await s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:d.id,expectedVersion:d.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'})).order;await s.dispatch('whatsapp.conversation.handoff',{accountId:'a',conversationHash:'hash'});assert.equal((await s.dispatch('whatsapp.message.claim',{accountId:'a',conversationHash:'hash',messageId:'m1'})).reason,'needs_staff');const listed=(await s.dispatch('whatsapp.conversation.list'))[0];assert.equal(typeof listed.conversationId,'string');assert.equal('conversationHash' in listed,false);assert.equal(JSON.stringify(listed).includes('+1000'),false);assert.equal(JSON.stringify(listed).includes('cipher'),false);assert.equal(JSON.stringify(listed).includes('hi'),false);await s.dispatch('whatsapp.conversation.resume',{conversationId:listed.conversationId});await s.prisma.localWhatsAppConversation.update({where:{accountId_conversationHash:{accountId:'a',conversationHash:'hash'}},data:{lastMessageAt:1}});await s.dispatch('whatsapp.cleanup',{days:30});assert.equal(await s.prisma.localWhatsAppConversation.count(),0);assert.equal(await s.prisma.localOrder.count({where:{id:o.id}}),1);});
test('simultaneous draft confirmations create one order and fulfill stock/coupon/print once',async t=>{const s=await setup(t);await ingest(s);await ingest(s,'m2','تأكيد');await s.dispatch('inventory.saveStock',{stock:{id:'item1',name:'Item',quantity:3}});await s.dispatch('menu.saveItem',{itemData:{id:'item1',name:'Item',price:5}});await s.dispatch('coupons.save',{couponData:{id:'cp',code:'SAVE',discountType:'fixed',discountValue:1,isActive:true,usageLimit:1}});const r=await s.dispatch('whatsapp.draft.update',{accountId:'a',conversationHash:'hash',items:[{itemId:'item1',quantity:1}],orderDetails:{deliveryMethod:'pickup',couponCode:'SAVE',customerName:'N',address:'addr',paymentMethod:'cash'},customerPhone:'123'});await s.dispatch('whatsapp.draft.awaiting',{draftId:r.draft.id,expectedVersion:r.draft.version});const payload={accountId:'a',conversationHash:'hash',draftId:r.draft.id,expectedVersion:r.draft.version,customerPhone:'123',confirmationEncryptedReplyTarget:'cipher'};const out=await Promise.all([s.dispatch('whatsapp.draft.confirm',{...payload,confirmationMessageId:'m1'}),s.dispatch('whatsapp.draft.confirm',{...payload,confirmationMessageId:'m2'})]);assert.equal(out[0].order.id,out[1].order.id);assert.equal(out.filter(x=>x.replay).length,1);assert.equal(await s.prisma.localOrder.count({where:{draftId:r.draft.id,source:'WHATSAPP'}}),1);assert.deepEqual((await s.dispatch('inventory.get')).stockList.find(x=>x.id==='item1').quantity,2);assert.equal(await s.prisma.localCouponUsage.count({where:{orderId:out[0].order.id}}),1);assert.equal(await s.prisma.localPrintJob.count({where:{orderId:out[0].order.id}}),2);const raw=await s.prisma.localOrder.findUnique({where:{id:out[0].order.id}});assert.equal(raw.source,'WHATSAPP');assert.equal(raw.draftId,r.draft.id);assert.equal(JSON.parse(raw.data).source,'WHATSAPP');assert.equal(JSON.parse(raw.data).draftId,r.draft.id);assert.equal(out[0].order.customer.name,'N');assert.equal(out[0].order.customer.address,'addr');});
test('pre-dispatch print failure is retried once and then notified without another claim',async t=>{
  const s=await setup(t);await ingest(s);const draft=await createDraft(s,'pickup');
  await s.dispatch('whatsapp.draft.awaiting',{draftId:draft.id,expectedVersion:draft.version});
  const order=(await s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:draft.id,expectedVersion:draft.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'})).order;
  const jobs=await s.dispatch('whatsapp.print.pending'),job=jobs.find(row=>row.orderId===order.id);
  assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:job.id}),true);
  await s.dispatch('whatsapp.print.complete',{jobId:job.id,status:'failed',errorCode:'PRINT_NOT_DISPATCHED'});
  assert.ok((await s.dispatch('whatsapp.print.pending')).some(row=>row.id===job.id));
  assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:job.id}),true);
  await s.dispatch('whatsapp.print.complete',{jobId:job.id,status:'failed',errorCode:'PRINT_NOT_DISPATCHED'});
  assert.equal((await s.dispatch('whatsapp.print.pending')).some(row=>row.id===job.id),false);
  assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:job.id}),false);
  const other=jobs.find(row=>row.id!==job.id);
  assert.equal(await s.dispatch('whatsapp.print.claim',{jobId:other.id}),true);
  await s.dispatch('whatsapp.print.complete',{jobId:other.id,status:'printed'});
  const message=await s.prisma.localWhatsAppMessage.findFirst({where:{messageId:'m1'}});
  assert.equal(message.replyStatus,'pending');
  assert.match(message.replyText,/تعذر تأكيد اكتمال الطباعة/);
  assert.equal(await s.prisma.localPrintJob.findUnique({where:{id:job.id}}).then(row=>row.attempts),2);
});

test('reopen after print in-flight marks outcome unknown and releases confirmation reply once',async t=>{const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'wa-reopen-'));let s=createLocalStore({dataDir,seed:false,autoBackup:false});await s.initialize();await ingest(s);const d=await createDraft(s,'pickup');await s.dispatch('whatsapp.draft.awaiting',{draftId:d.id,expectedVersion:d.version});const o=(await s.dispatch('whatsapp.draft.confirm',{accountId:'a',conversationHash:'hash',draftId:d.id,expectedVersion:d.version,confirmationMessageId:'m1',confirmationEncryptedReplyTarget:'cipher'})).order;const jobs=await s.dispatch('whatsapp.print.pending');await s.dispatch('whatsapp.print.claim',{jobId:jobs[0].id});await s.dispatch('whatsapp.print.claim',{jobId:jobs[1].id});await s.dispatch('whatsapp.print.complete',{jobId:jobs[1].id,status:'printed'});await s.checkpointAndClose();s=createLocalStore({dataDir,seed:false,autoBackup:false});await s.initialize();t.after(async()=>{await s.checkpointAndClose();fs.rmSync(dataDir,{recursive:true,force:true});});assert.equal((await s.dispatch('whatsapp.print.recover')).recovered,1);const job=await s.prisma.localPrintJob.findUnique({where:{id:jobs[0].id}});assert.equal(job.status,'unknown');assert.equal(job.errorCode,'INTERRUPTED_BY_RESTART');const msg=await s.prisma.localWhatsAppMessage.findFirst({where:{messageId:'m1'}});assert.equal(msg.replyStatus,'pending');assert.match(msg.replyText,/تعذر تأكيد اكتمال الطباعة/);assert.equal((await s.dispatch('whatsapp.message.reply.pending')).length,1);await s.dispatch('whatsapp.print.recover');assert.equal((await s.dispatch('whatsapp.message.reply.pending')).length,1);assert.equal(await s.prisma.localOrder.count({where:{id:o.id}}),1);});

test('agent personality is stored locally, validated, and locked while the agent is enabled',async t=>{
  const s=await setup(t);
  const defaults={botName:'مساعد Aura POS',businessName:'',tone:'friendly',replyLength:'short',instructions:'',useEmoji:false};
  assert.deepEqual(await s.dispatch('whatsapp.agent.personality.get'),defaults);
  const saved=await s.dispatch('whatsapp.agent.personality.set',{botName:'سارة',businessName:'مخبز تجريبي',tone:'professional',replyLength:'medium',instructions:'استخدم أسلوبًا واضحًا.',useEmoji:false});
  assert.deepEqual(saved,{botName:'سارة',businessName:'مخبز تجريبي',tone:'professional',replyLength:'medium',instructions:'استخدم أسلوبًا واضحًا.',useEmoji:false});
  assert.deepEqual(await s.dispatch('whatsapp.agent.personality.get'),saved);
  await s.dispatch('whatsapp.agent.settings.set',{enabled:true,consentVersion: '2'});
  await assert.rejects(s.dispatch('whatsapp.agent.personality.set',{tone:'friendly'}),error=>error.code==='AGENT_ENABLED');
  await s.dispatch('whatsapp.agent.settings.set',{enabled:false,consentVersion: '2'});
  await assert.rejects(s.dispatch('whatsapp.agent.personality.set',{tone:'unsafe'}),error=>error.code==='INVALID_PERSONALITY');
  await assert.rejects(s.dispatch('whatsapp.agent.personality.set',{instructions:'x'.repeat(2001)}),error=>error.code==='INVALID_PERSONALITY');
});
