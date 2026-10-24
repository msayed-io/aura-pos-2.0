/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS module is shared with Electron's Node utility process. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

class StoreError extends Error {
  constructor(code, message, details) { super(message); this.name = 'StoreError'; this.code = code; this.status = code === 'ORDER_NOT_FOUND' ? 404 : code === 'UNKNOWN_ACTION' || code.startsWith('INVALID_') || ['COUPON_INVALID','COUPON_NOT_FOUND','INVENTORY_ITEM_MISSING','SERIAL_STOCK_INVALID','MIGRATION_CHECKSUM_MISMATCH','MIGRATION_SQL_UNSUPPORTED'].includes(code) ? 400 : code === 'UNIQUE_CONSTRAINT' || code === 'INSUFFICIENT_STOCK' || code === 'INSUFFICIENT_SERIALS' || code === 'COUPON_EXHAUSTED' ? 409 : 500; if (details) this.details = details; }
}
const now = () => Date.now();
const json = (x) => JSON.stringify(x ?? null);
const parse = (s) => { try { return JSON.parse(s); } catch (e) { throw new StoreError('DATA_CORRUPT', 'Stored data is not valid JSON', { cause: e.message }); } };
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const safeEqual = (a,b) => String(a).toUpperCase() === String(b).toUpperCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function sqliteUrl(file) {
  // Prisma 6's native SQLite connector treats the file: path literally; percent
  // encoding spaces/Unicode points at a different file instead of decoding it.
  const resolved = path.resolve(file).replace(/\\/g, '/');
  if (resolved.includes('?')) throw new StoreError('INVALID_DATA_PATH', 'The local data directory cannot contain a question mark');
  return `file:${resolved}?connection_limit=1`;
}
function syncFile(file) {
  // FlushFileBuffers on Windows needs a writable handle, not a read-only one.
  const descriptor = fs.openSync(file, 'r+');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function syncDirectory(directory) {
  // Node does not expose portable directory flushing on Windows. Files are
  // flushed before the same-directory atomic rename; POSIX also flushes the dir.
  if (process.platform === 'win32') return;
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function defaultDataDir() {
  const env = process.env.AURA_DATA_DIR;
  if (env) return path.resolve(env);
  if (process.env.APPDATA) return path.join(process.env.APPDATA, 'Aura POS');
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'Aura POS');
  return path.join(os.homedir(), '.aura-pos-data');
}
function createLocalStore({ dataDir, autoBackup = true, seed = true, migrationsDir } = {}) {
  // Runtime userData is not a build input; required runtime assets are explicitly traced in next.config.ts.
  const root = path.resolve(/*turbopackIgnore: true*/ dataDir || defaultDataDir());
  const backups = path.join(root, 'backups');
  const explicitMigrationRoot = migrationsDir || process.env.AURA_MIGRATIONS_DIR;
  const migrationCandidates = explicitMigrationRoot ? [explicitMigrationRoot] : [path.resolve(process.cwd(), 'prisma', 'migrations'), path.resolve(__dirname, '..', 'prisma', 'migrations')];
  const migrationRoot = migrationCandidates.find(candidate => fs.existsSync(candidate)) || migrationCandidates[0];
  const logFile = path.join(root, 'local-store.log');
  let prisma = null, initialized = false, initializing = null, backupTimer = null, recoveryNotice = null;

  function log(code, context = {}) {
    const safe = JSON.stringify({ time: new Date().toISOString(), code, context });
    try { fs.mkdirSync(root, { recursive: true }); if (fs.existsSync(logFile) && fs.statSync(logFile).size > 128 * 1024) { const prev = `${logFile}.1`; try { fs.rmSync(prev, { force: true }); } catch (rotateError) { try { fs.writeSync(2,JSON.stringify({code:'LOG_ROTATION_FAILED',errorCode:rotateError.code||'IO_ERROR'})+'\n'); } catch (stderrError) { /* best effort */ } } fs.renameSync(logFile, prev); } fs.appendFileSync(logFile, safe + '\n', { mode: 0o600 }); } catch (logError) { try { fs.writeSync(2, JSON.stringify({code:'LOCAL_STORE_LOG_UNAVAILABLE',errorCode:logError.code||'IO_ERROR'})+'\n'); } catch (stderrError) { /* best-effort diagnostic only */ } }
  }
  function makeClient() {
    const dbPath = path.join(root, 'aura.sqlite');
    const url = sqliteUrl(dbPath);
    return new PrismaClient({ datasources: { db: { url } }, log: [] });
  }
  async function setPragmas(client) {
    const journal = await client.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    if (String(journal[0]?.journal_mode).toLowerCase() !== 'wal') throw new StoreError('DATABASE_CORRUPT','SQLite could not enter WAL mode; database may be damaged');
    await client.$queryRawUnsafe('PRAGMA synchronous=FULL');
    await client.$queryRawUnsafe('PRAGMA foreign_keys=ON');
    await client.$queryRawUnsafe('PRAGMA busy_timeout=5000');
    const values = await client.$queryRawUnsafe('PRAGMA synchronous');
    const fk = await client.$queryRawUnsafe('PRAGMA foreign_keys');
    const timeout = await client.$queryRawUnsafe('PRAGMA busy_timeout');
    const journalCheck = await client.$queryRawUnsafe('PRAGMA journal_mode');
    if (String(journalCheck[0]?.journal_mode).toLowerCase() !== 'wal' || Number(values[0].synchronous) !== 2 || Number(fk[0].foreign_keys) !== 1 || Number(timeout[0].timeout ?? timeout[0].busy_timeout) !== 5000) throw new StoreError('PRAGMA_CONFIGURATION_FAILED', 'SQLite durability settings could not be verified');
  }
  async function retry(fn, tries = 6) {
    let error;
    for (let n = 0; n < tries; n++) { try { return await fn(); } catch (e) { error = e; if (!/busy|locked|SQLITE_BUSY/i.test(String(e?.message)) || n === tries - 1) break; await sleep(Math.min(50 * (2 ** n), 1000)); } }
    throw error;
  }
  function splitSql(sql) {
    const out=[]; let start=0, quote=null, lineComment=false, blockComment=false;
    for(let i=0;i<sql.length;i++) { const ch=sql[i], next=sql[i+1];
      if(lineComment){if(ch==='\n') lineComment=false; continue;}
      if(blockComment){if(ch==='*'&&next==='/'){blockComment=false;i++;}continue;}
      if(quote){if(ch===quote){if(next===quote){i++;continue;}quote=null;}else if(ch==='\\'&&quote!==']') i++;continue;}
      if(ch==='-'&&next==='-'){lineComment=true;i++;continue;} if(ch==='/'&&next==='*'){blockComment=true;i++;continue;}
      if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;} if(ch==='['){quote=']';continue;}
      if(ch===';'){const part=sql.slice(start,i).trim();if(part)out.push(part);start=i+1;}
    }
    if(quote||blockComment) throw new StoreError('MIGRATION_SQL_UNSUPPORTED','Unterminated quote or comment in migration SQL');
    const tail=sql.slice(start).trim();if(tail)out.push(tail);return out;
  }
  async function applyMigrations(client) {
    await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_LocalMigrations" ("name" TEXT NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL, "appliedAt" INTEGER NOT NULL)');
    if (!migrationRoot || !fs.existsSync(migrationRoot)) throw new StoreError('MIGRATIONS_NOT_FOUND','Local database migrations directory was not found');
    const dirs = fs.readdirSync(migrationRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    if (!dirs.length) throw new StoreError('MIGRATIONS_NOT_FOUND','No local database migrations were found');
    for (const name of dirs) {
      const file = path.join(migrationRoot, name, 'migration.sql');
      if (!fs.existsSync(file)) throw new StoreError('MIGRATIONS_NOT_FOUND',`Migration SQL file missing: ${name}`);
      const sql = fs.readFileSync(file, 'utf8'), checksum = crypto.createHash('sha256').update(sql).digest('hex');
      try {
        await retry(() => client.$transaction(async tx => {
          // This update obtains a SQLite write lock before executing the migration body.
          await tx.$executeRawUnsafe('INSERT OR IGNORE INTO "_LocalMigrations" (name, checksum, appliedAt) VALUES (?, ?, ?)', '__migration_lock__', 'lock', now());
          const prior = await tx.$queryRawUnsafe('SELECT checksum FROM "_LocalMigrations" WHERE name = ?', name);
          if (prior.length) { if (prior[0].checksum !== checksum) throw new StoreError('MIGRATION_CHECKSUM_MISMATCH', `Migration checksum mismatch: ${name}`); return; }
          const statements = splitSql(sql);
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          await tx.$executeRawUnsafe('INSERT INTO "_LocalMigrations" (name, checksum, appliedAt) VALUES (?, ?, ?)', name, checksum, now());
        }, { maxWait: 5000, timeout: 30000 }));
      } catch (e) { log('MIGRATION_FAILED', { migration: name, errorCode: e.code || 'SQL_ERROR' }); if(e instanceof StoreError) throw e; throw new StoreError('MIGRATION_FAILED', `Migration ${name} failed and was rolled back.`, { migration: name, prismaCode:e.code }); }
    }
    await client.$executeRawUnsafe('DELETE FROM "_LocalMigrations" WHERE name = ?', '__migration_lock__');
  }
  async function quickCheck(client) {
    const rows = await client.$queryRawUnsafe('PRAGMA quick_check');
    return rows.length === 1 && String(rows[0].quick_check).toLowerCase() === 'ok';
  }
  async function validBackup(file) {
    const probe = path.join(root, `.backup-check-${process.pid}-${crypto.randomBytes(4).toString('hex')}.sqlite`);
    try {
      fs.copyFileSync(file, probe);
      const client = new PrismaClient({ datasources: { db: { url: sqliteUrl(probe) } }, log: [] });
      try {
        await client.$connect();
        await setPragmas(client);
        return await quickCheck(client);
      } finally { await client.$disconnect(); }
    } catch (backupError) {
      log('BACKUP_VALIDATION_FAILED', { name: path.basename(file), code: backupError.code || 'INVALID_SNAPSHOT' });
      return false;
    } finally {
      for (const candidate of [probe, `${probe}-wal`, `${probe}-shm`]) {
        try { fs.rmSync(candidate, { force: true }); }
        catch (cleanupError) { log('PROBE_CLEANUP_FAILED', { code: cleanupError.code || 'IO_ERROR' }); }
      }
    }
  }
  async function restoreBackup(client) {
    const marker = path.join(root, 'recovery-required.json');
    try { fs.writeFileSync(marker, json({ code: 'DATABASE_RECOVERY_REQUIRED' }), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw new StoreError('DATABASE_RECOVERY_FAILED', 'تعذر تثبيت علامة الاستعادة؛ لم تُستبدل قاعدة البيانات.', { code: error.code }); }
    syncFile(marker);
    syncDirectory(root);
    const db = path.join(root, 'aura.sqlite');
    const bad = `${db}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
    if (client) await client.$disconnect();
    prisma = null;
    if (fs.existsSync(db)) fs.renameSync(db, bad);
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(/*turbopackIgnore: true*/ db + suffix)) fs.renameSync(db + suffix, bad + suffix);
    syncDirectory(root);
    const files = fs.existsSync(backups) ? fs.readdirSync(backups).filter(file => file.endsWith('.sqlite')).sort().reverse() : [];
    for (const name of files) {
      const candidate = path.join(backups, name);
      if (!(await validBackup(candidate))) { log('BACKUP_SKIPPED_CORRUPT', { name }); continue; }
      const temporary = `${db}.restore.partial`;
      try {
        fs.copyFileSync(candidate, temporary);
        syncFile(temporary);
        fs.renameSync(temporary, db);
        syncDirectory(root);
      } catch (error) {
        try { fs.rmSync(temporary, { force: true }); }
        catch (cleanupError) { log('RESTORE_CLEANUP_FAILED', { code: cleanupError.code || 'IO_ERROR' }); }
        throw new StoreError('DATABASE_RECOVERY_FAILED', 'تعذر إكمال الاستعادة؛ علامة الحماية والملفات المعزولة محفوظة.', { code: error.code });
      }
      recoveryNotice = `عُزلت قاعدة البيانات السابقة، واستُعيدت نسخة سليمة (${name}). راجع الطلبات الأحدث من وقت النسخة.`;
      log('DATABASE_RESTORED', { backup: name });
      // initialize verifies this actual restored connection with all PRAGMAs and
      // quick_check before removing the durable recovery marker or serving sales.
      return makeClient();
    }
    throw new StoreError('DATABASE_CORRUPT_NO_BACKUP', 'قاعدة البيانات تالفة ولا توجد نسخة احتياطية سليمة. الملفات المعزولة محفوظة داخل بيانات التطبيق؛ لم تُنشأ قاعدة فارغة.');
  }
  async function backup(client) {
    fs.mkdirSync(backups, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backups, `aura-${stamp}-${crypto.randomBytes(4).toString('hex')}.sqlite`);
    const partial = `${dest}.partial`;
    try {
      await client.$executeRawUnsafe('VACUUM INTO ?', partial);
      if (!(await validBackup(partial))) throw new StoreError('BACKUP_INVALID', 'The generated SQLite backup did not pass quick_check');
      syncFile(partial);
      fs.renameSync(partial, dest);
      syncDirectory(backups);
    } catch (error) {
      for (const file of [partial, `${partial}-wal`, `${partial}-shm`]) {
        try { fs.rmSync(file, { force: true }); }
        catch (cleanupError) { log('BACKUP_CLEANUP_FAILED', { code: cleanupError.code || 'IO_ERROR' }); }
      }
      if (error instanceof StoreError) throw error;
      throw new StoreError('BACKUP_FAILED', 'تعذر إنشاء النسخة الاحتياطية المحلية؛ لم تُنشر نسخة ناقصة.', { code: error.code });
    }
    const files = fs.readdirSync(backups).filter(f => f.endsWith('.sqlite')).sort().reverse();
    for (const f of files.slice(7)) fs.rmSync(path.join(backups, f), { force: true });
    log('BACKUP_CREATED', { name: path.basename(dest) });
    return dest;
  }
  async function initialize() {
    if (initialized) return { ok: true, notice: recoveryNotice };
    if (initializing) return initializing;
    initializing = (async () => {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      prisma = fs.existsSync(path.join(root, 'recovery-required.json')) ? await restoreBackup(null) : makeClient();
      try {
        await prisma.$connect(); await setPragmas(prisma); await applyMigrations(prisma);
        if (!(await quickCheck(prisma))) { prisma = await restoreBackup(prisma); await prisma.$connect(); await setPragmas(prisma); await applyMigrations(prisma); if (!(await quickCheck(prisma))) throw new StoreError('DATABASE_CORRUPT', 'Restored database failed quick_check'); }
      } catch (e) {
        if (e.code === 'DATABASE_CORRUPT_NO_BACKUP') throw e;
        const msg = String(e?.message || '');
        if (e.code === 'DATABASE_CORRUPT' || /malformed|not a database|corrupt/i.test(msg)) { try { prisma = await restoreBackup(prisma); await prisma.$connect(); await setPragmas(prisma); await applyMigrations(prisma); if (!(await quickCheck(prisma))) throw new StoreError('DATABASE_CORRUPT', 'Restored database failed quick_check'); } catch (restoreError) { log('DATABASE_RECOVERY_FAILED', { code: restoreError.code || 'RECOVERY_ERROR' }); throw restoreError; } }
        else { log('INITIALIZE_FAILED', { code: e.code || 'INITIALIZE_ERROR' }); throw e; }
      }
      if (seed) await seedExistingData();
      if (recoveryNotice) await prisma.localNotice.upsert({where:{id:'database-restored'},create:{id:'database-restored',data:json({id:'database-restored',code:'DATABASE_RESTORED',message:recoveryNotice})},update:{data:json({id:'database-restored',code:'DATABASE_RESTORED',message:recoveryNotice})}});
      const marker = path.join(root, 'recovery-required.json');
      if (fs.existsSync(marker)) { fs.rmSync(marker); syncDirectory(root); }
      if (autoBackup) { try { await backup(prisma); } catch (e) { log('BACKUP_FAILED', { code: e.code || 'BACKUP_ERROR' }); throw e; } backupTimer = setInterval(() => backup(prisma).catch(e => log('BACKUP_FAILED', { code: e.code || 'BACKUP_ERROR' })), 24 * 60 * 60 * 1000); backupTimer.unref?.(); }
      initialized = true;
      return { ok: true, notice: recoveryNotice };
    })();
    try { return await initializing; } catch(e) { if(backupTimer) clearInterval(backupTimer); backupTimer=null; if(prisma){const c=prisma;prisma=null;try{await c.$disconnect()}catch(disconnectError){log('DISCONNECT_FAILED',{code:disconnectError.code||'DISCONNECT_ERROR'})}} initialized=false; throw e; } finally { initializing = null; }
  }
  async function seedExistingData() {
    const seeds = require('./seed.json');
    const marker = await prisma.localMetadata.findUnique({where:{key:'seed-v1'}});
    if (marker) return;
    await prisma.$transaction(async tx => {
    if (await tx.localInventory.count() === 0) for (const s of seeds.inventory) await tx.localInventory.create({ data: { id:s.id, quantity:s.quantity, data:json(s) } });
    if (await tx.localMenu.count({ where:{ kind:'recipe' } }) === 0) for (const m of seeds.recipes) await tx.localMenu.create({ data:{ id:m.id, kind:'recipe', position:0, data:json(m) } });
    if (await tx.localSerial.count() === 0) for (const s of seeds.serials) await tx.localSerial.create({ data:{ serialNumber:s.serialNumber, productId:s.productId, status:s.status, addedAt:BigInt(s.addedAt), data:json(s) } });
    // Preserve, rather than recreate, only the two exact legacy dashboard examples.
    if (await tx.localOrder.count() === 0) for (const o of seeds.legacyOrders) { const legacy = { ...o, createdAt: now() - Number(o.ageMs || 0) }; delete legacy.ageMs; await persistOrder(tx, legacy, null, false); }
    const existing = await tx.localOrder.findMany({ select:{displayId:true} });
    const counter = await tx.localCounter.findUnique({where:{name:'orders'}});
    const maxNumber = Math.max(Number(counter?.value||1000),...existing.map(order=>Number(String(order.displayId).replace(/^.*?(\d+)$/, '$1'))||1000));
    await tx.localCounter.upsert({ where:{name:'orders'}, create:{name:'orders',value:maxNumber}, update:{value:Math.max(maxNumber,counter?.value||0)} });
    await tx.localMetadata.create({data:{key:'seed-v1',value:String(now())}});
    }, txOptions);
  }
  function orderView(row) { const o=parse(row.data); return { ...o, id:row.id, displayId:row.displayId, createdAt:Number(row.createdAt), isArchived:row.isArchived, items:(row.items || []).map(x=>parse(x.data)) }; }
  async function persistOrder(tx, order, requestId, stockApplied=true) {
    const { items=[], ...rest } = order;
    await tx.localOrder.create({ data:{ id:order.id, displayId:order.displayId, requestId, createdAt:BigInt(order.createdAt), isArchived:!!order.isArchived, stockApplied, data:json(rest), items:{ create:items.map(it=>({id:id('oi'),data:json(it)})) } } });
  }
  async function inventoryState() {
    const [stock, serials, recipes] = await Promise.all([prisma.localInventory.findMany({ orderBy:{id:'asc'} }), prisma.localSerial.findMany({orderBy:{addedAt:'asc'}}), prisma.localMenu.findMany({where:{kind:'recipe'}})]);
    return { stockList:stock.map(r=>parse(r.data)), serialRecords:serials.map(r=>parse(r.data)), insights:[] };
  }
  async function fulfill(tx, order) {
    for(const item of order.items||[]) if(!Number.isFinite(Number(item.quantity))||Number(item.quantity)<=0||(item.isWeightBased&&(!Number.isFinite(Number(item.weight))||Number(item.weight)<=0))) throw new StoreError('INVALID_ORDER','Order quantities and weights must be finite and positive');
    const recipes = await tx.localMenu.findMany({ where:{kind:'recipe'} }), recipeMap=new Map(recipes.map(r=>[r.id,parse(r.data)]));
    for(const r of recipes){const data=parse(r.data); for(const ing of data.recipe||[]) if(!Number.isFinite(Number(ing.quantity))||Number(ing.quantity)<0) throw new StoreError('INVALID_RECIPE','Recipe ingredient quantity must be a finite non-negative number');}
    const needed=new Map(), serialNeed=new Map();
    for (const item of order.items || []) {
      const menu=recipeMap.get(item.id);
      if (item.isWeightBased && item.weight) needed.set(item.id,(needed.get(item.id)||0)+(Number(item.weight)||Number(item.quantity)));
      else if (!menu) needed.set(item.id,(needed.get(item.id)||0)+Number(item.quantity));
      else if (Array.isArray(menu.recipe)&&menu.recipe.length) for (const ing of menu.recipe) needed.set(ing.inventoryItemId,(needed.get(ing.inventoryItemId)||0)+Number(ing.quantity)*Number(item.quantity));
      else needed.set(menu.id,(needed.get(menu.id)||0)+Number(item.quantity));
    }
    for (const [stockId, qty] of needed) {
      const stock=await tx.localInventory.findUnique({where:{id:stockId}});
      if (!stock) { if (recipeMap.has(stockId) || [...recipeMap.values()].some(m=>(m.recipe||[]).some(i=>i.inventoryItemId===stockId))) throw new StoreError('INVENTORY_ITEM_MISSING', `Recipe references missing inventory item: ${stockId}`, {stockId}); continue; }
      if (stock.quantity < qty) throw new StoreError('INSUFFICIENT_STOCK', `Insufficient stock for ${stockId}`, {stockId,required:qty,available:stock.quantity});
      const menu=recipeMap.get(stockId);
      if (menu?.requiresSerial) serialNeed.set(stockId,qty);
      const upd=await tx.localInventory.updateMany({where:{id:stockId,quantity:{gte:qty}},data:{quantity:{decrement:qty}}});
      if (upd.count !== 1) throw new StoreError('INSUFFICIENT_STOCK', `Stock changed concurrently for ${stockId}`, {stockId,required:qty});
      const fresh=await tx.localInventory.findUnique({where:{id:stockId}}), data=parse(fresh.data); data.quantity=fresh.quantity; await tx.localInventory.update({where:{id:stockId},data:{data:json(data)}});
    }
    for (const [productId, qty] of serialNeed) {
      if (!Number.isInteger(qty)) throw new StoreError('SERIAL_STOCK_INVALID', `Serial-tracked quantity must be whole for ${productId}`);
      const available=await tx.localSerial.findMany({where:{productId,status:'AVAILABLE'},orderBy:{addedAt:'asc'},take:qty});
      if (available.length<qty) throw new StoreError('INSUFFICIENT_SERIALS',`Not enough available serials for ${productId}`,{productId,required:qty,available:available.length});
      for (const record of available) { const d=parse(record.data); d.status='SOLD'; d.soldAt=now(); d.orderId=order.id; await tx.localSerial.update({where:{serialNumber:record.serialNumber},data:{status:'SOLD',soldAt:BigInt(d.soldAt),orderId:order.id,data:json(d)}}); }
    }
  }
  const txOptions={ maxWait:5000, timeout:30000 };
  async function dispatch(action,payload={}) {
    if (!initialized) await initialize();
    try {
      switch(action) {
        case 'bootstrap': { const [orders,inventory,menu,coupons,notices]=await Promise.all([dispatch('orders.list'),inventoryState(),dispatch('menu.get'),dispatch('coupons.list'),prisma.localNotice.findMany()]); return { orders, menu, inventory, coupons, notices:notices.map(n=>parse(n.data)), ...(recoveryNotice?{recoveryNotice}: {}) }; }
        case 'orders.list': return (await prisma.localOrder.findMany({include:{items:true},orderBy:{createdAt:'desc'}})).map(orderView);
        case 'orders.add': {
          const data=payload.orderData||{}, requestId=data._requestId||null;
          if (requestId) { const old=await prisma.localOrder.findUnique({where:{requestId},include:{items:true}}); if(old) return {...orderView(old),_isReplay:true}; }
          validateOrder(data);
          return await retry(()=>prisma.$transaction(async tx=>{
            if(requestId) { const duplicate=await tx.localOrder.findUnique({where:{requestId},include:{items:true}}); if(duplicate) return {...orderView(duplicate),_isReplay:true}; }
            const c=await tx.localCounter.upsert({where:{name:'orders'},create:{name:'orders',value:1001},update:{value:{increment:1}}});
            const sequence=c.value; const timestamp=now(); const order={...data,id:id('order'),displayId:`AURA-${sequence}`,createdAt:timestamp,source:data.source||'POS',cashierId:data.cashierId||payload.cashierId,cashierName:data.cashierName||payload.cashierName}; delete order._requestId;
            if (data.couponCode) await useCoupon(tx,data.couponCode,order);
            await fulfill(tx,order);
            await persistOrder(tx,order,requestId,true);
            return order;
          },txOptions));
        }
        case 'orders.status': return changeOrder(payload.orderId, {status:payload.status});
        case 'orders.update': return changeOrder(payload.orderId,payload.updates||{});
        case 'orders.archive': return changeOrder(payload.orderId,{isArchived:!!payload.isArchived});
        case 'orders.archiveAll': await prisma.localOrder.updateMany({data:{isArchived:true}}); return true;
        case 'orders.delete': { const ids=payload.orderIds||[]; await prisma.localOrder.deleteMany({where:{id:{in:ids}}}); return true; }
        case 'menu.get': { const rows=await prisma.localMenu.findMany({where:{kind:{in:['item','category','offer']}},orderBy:{position:'asc'}}); return {menuItems:rows.filter(r=>r.kind==='item').map(r=>parse(r.data)),categories:rows.filter(r=>r.kind==='category').map(r=>parse(r.data)),offers:rows.filter(r=>r.kind==='offer').map(r=>parse(r.data))}; }
        case 'menu.saveItem': return saveMenu(payload.itemData,'item');
        case 'menu.deleteItem': await prisma.localMenu.deleteMany({where:{id:payload.itemId,kind:'item'}}); return true;
        case 'menu.saveOffer': return saveMenu(payload.offerData,'offer');
        case 'menu.deleteOffer': await prisma.localMenu.deleteMany({where:{id:payload.offerId,kind:'offer'}}); return true;
        case 'menu.saveCategories': await prisma.$transaction(async tx=>{await tx.localMenu.deleteMany({where:{kind:'category'}}); for(let i=0;i<(payload.categories||[]).length;i++) await tx.localMenu.create({data:{id:payload.categories[i].id||`category-${i}`,kind:'category',position:i,data:json(payload.categories[i])}});},txOptions); return true;
        case 'inventory.get': return inventoryState();
        case 'inventory.registerMenu': await prisma.$transaction(async tx=>{ for(const m of payload.items||[]) { validateRecipe(m); await tx.localMenu.upsert({where:{kind_id:{kind:'recipe',id:m.id}},create:{id:m.id,kind:'recipe',position:0,data:json(m)},update:{data:json(m)}}); }},txOptions); return true;
        case 'inventory.fulfillOrder': return await prisma.$transaction(async tx=>{const row=await tx.localOrder.findUnique({where:{id:payload.orderId},include:{items:true}}); if(!row) throw new StoreError('ORDER_NOT_FOUND',`Order not found: ${payload.orderId}`); if(row.stockApplied) return await readInventoryTx(tx); const order=orderView(row); await fulfill(tx,order); await tx.localOrder.update({where:{id:row.id},data:{stockApplied:true}}); return readInventoryTx(tx);},txOptions);
        case 'inventory.saveStock': return saveStock(payload.stock);
        case 'inventory.saveSerial': return saveSerial(payload.serial);
        case 'coupons.list': return (await prisma.localCoupon.findMany({orderBy:{id:'asc'}})).map(r=>parse(r.data));
        case 'coupons.save': return saveCoupon(payload.couponData);
        case 'coupons.delete': { const x=payload.couponIdOrCode; await prisma.$executeRawUnsafe('DELETE FROM "LocalCoupon" WHERE "id" = ? OR UPPER("code") = UPPER(?)', String(x), String(x)); return true; }
        case 'coupons.validate': return validateCoupon(payload.code);
        case 'coupons.increment': await prisma.$transaction(async tx=>{const c=await findCoupon(tx,payload.code); if(!c) throw new StoreError('COUPON_NOT_FOUND','Coupon not found'); await tx.localCoupon.update({where:{id:c.id},data:{usageCount:{increment:1}}}); const v=parse(c.data); v.usageCount++; await tx.localCoupon.update({where:{id:c.id},data:{data:json(v)}});},txOptions); return true;
        case 'coupons.log': return logCoupon(payload.logData);
        case 'coupons.logs': return (await prisma.localCouponUsage.findMany({orderBy:{timestamp:'desc'}})).map(r=>parse(r.data));
        case 'notices.dismiss': await prisma.localNotice.deleteMany({where:{id:payload.id}}); return true;
        default: throw new StoreError('UNKNOWN_ACTION','Unknown local store action');
      }
    } catch(e) { log('DISPATCH_FAILED',{action:['bootstrap','orders.list','orders.add','orders.status','orders.update','orders.archive','orders.archiveAll','orders.delete','menu.get','menu.saveItem','menu.deleteItem','menu.saveOffer','menu.deleteOffer','menu.saveCategories','inventory.get','inventory.registerMenu','inventory.fulfillOrder','inventory.saveStock','inventory.saveSerial','coupons.list','coupons.save','coupons.delete','coupons.validate','coupons.increment','coupons.log','coupons.logs','notices.dismiss'].includes(action)?action:'unknown',code:e.code||'STORE_ERROR'}); if(e instanceof StoreError) throw e; throw new StoreError(e.code==='P2002'?'UNIQUE_CONSTRAINT':'DATABASE_ERROR','Local storage request failed.',{action,prismaCode:e.code}); }
  }
  function validateOrder(d) { if(!d||typeof d!=='object'||!Array.isArray(d.items)||!d.items.length) throw new StoreError('INVALID_ORDER','Order requires at least one item'); const summary=d.summary||{}; for(const i of d.items) if(!Number.isFinite(Number(i.quantity))||Number(i.quantity)<=0||!Number.isFinite(Number(i.price))||Number(i.price)<0|| (i.isWeightBased && (!Number.isFinite(Number(i.weight))||Number(i.weight)<=0))) throw new StoreError('INVALID_ORDER','Order item quantity, weight and price must be valid numbers'); for(const k of ['subtotal','deliveryFee','discount','total']) if(summary[k]!==undefined&&(!Number.isFinite(Number(summary[k]))||Number(summary[k])<0)) throw new StoreError('INVALID_ORDER',`Invalid order summary ${k}`); }
  async function readInventoryTx(tx) { const [s,r]=await Promise.all([tx.localInventory.findMany(),tx.localSerial.findMany()]); return {stockList:s.map(x=>parse(x.data)),serialRecords:r.map(x=>parse(x.data)),insights:[]}; }
  async function changeOrder(orderId,updates) { return retry(()=>prisma.$transaction(async tx=>{ const row=await tx.localOrder.findUnique({where:{id:orderId},include:{items:true}}); if(!row) return false; const old=orderView(row), next={...old,...updates,id:old.id,displayId:old.displayId,createdAt:old.createdAt}; const {items,...rest}=next; await tx.localOrder.update({where:{id:orderId},data:{isArchived:!!next.isArchived,data:json(rest),items:{deleteMany:{},create:(items||[]).map(it=>({id:id('oi'),data:json(it)}))}}}); return orderView(await tx.localOrder.findUnique({where:{id:orderId},include:{items:true}})); },txOptions)); }
  async function saveMenu(item,kind) { if(item?.recipe) validateRecipe(item); if(!item||!item.id) throw new StoreError('INVALID_MENU_ITEM','Menu item requires id'); await prisma.localMenu.upsert({where:{kind_id:{kind,id:item.id}},create:{id:item.id,kind,position:Number(item.position)||0,data:json(item)},update:{position:Number(item.position)||0,data:json(item)}}); return item; }
  function validateRecipe(m){ if(!m||!Array.isArray(m.recipe))return; for(const ing of m.recipe) if(!Number.isFinite(Number(ing.quantity))||Number(ing.quantity)<0) throw new StoreError('INVALID_RECIPE','Recipe ingredient quantity must be a finite non-negative number'); }
  async function saveStock(stock) { if(!stock?.id||!Number.isFinite(Number(stock.quantity))||Number(stock.quantity)<0) throw new StoreError('INVALID_STOCK','Stock id and non-negative quantity are required'); const val={...stock,quantity:Number(stock.quantity)}; await prisma.localInventory.upsert({where:{id:val.id},create:{id:val.id,quantity:val.quantity,data:json(val)},update:{quantity:val.quantity,data:json(val)}}); return val; }
  async function saveSerial(s) { if(!s?.serialNumber||!s.productId||!['AVAILABLE','SOLD','RETURNED'].includes(s.status)) throw new StoreError('INVALID_SERIAL','Serial record is incomplete or has invalid status'); const val={...s,addedAt:s.addedAt||now()}; await prisma.localSerial.upsert({where:{serialNumber:val.serialNumber},create:{serialNumber:val.serialNumber,productId:val.productId,status:val.status,addedAt:BigInt(val.addedAt),soldAt:val.soldAt?BigInt(val.soldAt):null,orderId:val.orderId,data:json(val)},update:{productId:val.productId,status:val.status,soldAt:val.soldAt?BigInt(val.soldAt):null,orderId:val.orderId,data:json(val)}}); return val; }
  async function saveCoupon(c) { if(!c?.code||!['percentage','fixed'].includes(c.discountType)||!Number.isFinite(Number(c.discountValue))) throw new StoreError('INVALID_COUPON','Coupon code, discount type and value are required'); const val={id:c.id||id('coupon'),usageCount:Number(c.usageCount)||0,createdAt:c.createdAt||now(),isActive:c.isActive!==false,...c}; const prior=await findCoupon(prisma,val.code); if(prior) val.id=prior.id; await prisma.localCoupon.upsert({where:{id:val.id},create:{id:val.id,code:val.code,usageCount:val.usageCount,data:json(val)},update:{code:val.code,usageCount:val.usageCount,data:json(val)}}); return val; }
  async function findCoupon(tx,code) { if(!code)return null; const rows=await tx.$queryRawUnsafe('SELECT id FROM LocalCoupon WHERE UPPER(code)=UPPER(?) LIMIT 1',String(code)); return rows.length?tx.localCoupon.findUnique({where:{id:rows[0].id}}):null; }
  async function validateCoupon(code) { const row=await findCoupon(prisma,code); if(!row) return {success:false,message:'الكوبون غير صالح.'}; const c=parse(row.data); if(!c.isActive) return {success:false,message:'الكوبون غير فعال.'}; if(c.expiresAt&&Number(c.expiresAt)<now()) return {success:false,message:'انتهت صلاحية الكوبون.'}; if(c.usageLimit>0&&row.usageCount>=c.usageLimit)return {success:false,message:'تم تجاوز حد استخدام الكوبون.'}; return {success:true,coupon:{...c,usageCount:row.usageCount}}; }
  async function useCoupon(tx,code,order) { const row=await findCoupon(tx,code); if(!row) throw new StoreError('COUPON_INVALID','Coupon is invalid',{code}); const c=parse(row.data); if(!c.isActive||(c.expiresAt&&Number(c.expiresAt)<now())||(c.usageLimit>0&&row.usageCount>=c.usageLimit)) throw new StoreError('COUPON_EXHAUSTED','Coupon is inactive, expired or exhausted',{code}); const u=await tx.localCoupon.updateMany({where:{id:row.id,...(c.usageLimit>0?{usageCount:{lt:c.usageLimit}}:{})},data:{usageCount:{increment:1}}}); if(u.count!==1) throw new StoreError('COUPON_EXHAUSTED','Coupon usage limit was reached concurrently',{code}); c.usageCount=row.usageCount+1; await tx.localCoupon.update({where:{id:row.id},data:{data:json(c)}}); const log={id:id('coupon_usage'),couponId:row.id,orderId:order.id,timestamp:now(),discountApplied:Number(order.summary?.discount)||0,customerName:order.customer?.name||''}; await tx.localCouponUsage.create({data:{id:log.id,couponId:row.id,orderId:order.id,timestamp:BigInt(log.timestamp),data:json(log)}}); }
  async function logCoupon(input={}) { const val={id:id('coupon_usage'),timestamp:now(),...input}; await prisma.localCouponUsage.create({data:{id:val.id,couponId:val.couponId,orderId:val.orderId,timestamp:BigInt(val.timestamp),data:json(val)}}); return val; }
  async function checkpointAndClose() { if(backupTimer) clearInterval(backupTimer); backupTimer=null; if(!prisma)return; const p=prisma; try { await p.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)'); } catch(e) { log('CHECKPOINT_FAILED',{code:e.code||'CHECKPOINT_ERROR'}); throw e; } finally { await p.$disconnect(); prisma=null; initialized=false; } }
  async function verifySettings() { if (!initialized) await initialize(); const [journal, synchronous, foreignKeys, busyTimeout] = await Promise.all([prisma.$queryRawUnsafe('PRAGMA journal_mode'), prisma.$queryRawUnsafe('PRAGMA synchronous'), prisma.$queryRawUnsafe('PRAGMA foreign_keys'), prisma.$queryRawUnsafe('PRAGMA busy_timeout')]); return { journalMode:String(journal[0].journal_mode).toLowerCase(), synchronous:Number(synchronous[0].synchronous), foreignKeys:Number(foreignKeys[0].foreign_keys), busyTimeout:Number(busyTimeout[0].timeout ?? busyTimeout[0].busy_timeout) }; }
  async function createBackup() { if (!initialized) await initialize(); return backup(prisma); }
  return { initialize, dispatch, checkpointAndClose, createBackup, verifySettings, get ready(){return initialized;}, get prisma(){return prisma;} };
}
let defaultStore;
function getDefaultStore() { if(!defaultStore) defaultStore=createLocalStore({dataDir:defaultDataDir()}); return defaultStore; }
module.exports={createLocalStore,getDefaultStore,StoreError};
