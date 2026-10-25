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
const DEFAULT_AGENT_PERSONALITY = Object.freeze({ botName: 'مساعد Aura POS', businessName: '', tone: 'friendly', replyLength: 'short', instructions: '', useEmoji: false });
const PERSONALITY_KEYS = new Set(['botName', 'businessName', 'tone', 'replyLength', 'instructions', 'useEmoji']);
function validateAgentPersonality(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !PERSONALITY_KEYS.has(key))) {
    throw new StoreError('INVALID_PERSONALITY', 'Agent personality fields are invalid');
  }
  const result = { ...DEFAULT_AGENT_PERSONALITY, ...value };
  if (typeof result.botName !== 'string' || result.botName.trim().length > 80
    || typeof result.businessName !== 'string' || result.businessName.trim().length > 100
    || typeof result.instructions !== 'string' || result.instructions.length > 2000
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result.botName + result.businessName + result.instructions)
    || !['friendly', 'professional', 'concise'].includes(result.tone)
    || !['short', 'medium', 'long'].includes(result.replyLength)
    || typeof result.useEmoji !== 'boolean') {
    throw new StoreError('INVALID_PERSONALITY', 'Agent personality fields are invalid');
  }
  return { ...result, botName: result.botName.trim(), businessName: result.businessName.trim(), instructions: result.instructions.trim() };
}

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
    const journal = await retry(() => client.$queryRawUnsafe('PRAGMA journal_mode=WAL'));
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
    await retry(() => client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_LocalMigrations" ("name" TEXT NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL, "appliedAt" INTEGER NOT NULL)'));
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
    await retry(() => client.$executeRawUnsafe('DELETE FROM "_LocalMigrations" WHERE name = ?', '__migration_lock__'));
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
    await tx.localOrder.create({ data:{ id:order.id, displayId:order.displayId, requestId, source:order.source||'POS', draftId:order.draftId||null, createdAt:BigInt(order.createdAt), isArchived:!!order.isArchived, stockApplied, data:json(rest), items:{ create:items.map(it=>({id:id('oi'),data:json(it)})) } } });
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
  async function createOrderInTransaction(tx, data, requestId, cashier = {}) {
    if (requestId) {
      const existing = await tx.localOrder.findUnique({where:{requestId},include:{items:true}});
      if (existing) return {...orderView(existing),_isReplay:true};
    }
    validateOrder(data);
    const c=await tx.localCounter.upsert({where:{name:'orders'},create:{name:'orders',value:1001},update:{value:{increment:1}}});
    const order={...data,id:id('order'),displayId:`AURA-${c.value}`,createdAt:now(),source:data.source||'POS',cashierId:data.cashierId||cashier.cashierId,cashierName:data.cashierName||cashier.cashierName};
    delete order._requestId;
    if(order.couponCode) await useCoupon(tx,order.couponCode,order);
    await fulfill(tx,order);
    await persistOrder(tx,order,requestId,true);
    return order;
  }
  async function finalizePrint(tx, orderId) {
    const jobs=await tx.localPrintJob.findMany({where:{orderId}});
    if(!jobs.length||jobs.some(x=>x.status==='pending'||x.status==='printing'||(x.status==='failed'&&x.attempts<2))) return;
    if(jobs.every(x=>x.status==='printed')) await tx.localOrder.updateMany({where:{id:orderId,printedAt:null},data:{printedAt:BigInt(now())}});
    const d=await tx.localWhatsAppDraft.findFirst({where:{orderId}});
    if(!d)return;
    const data=parse(d.data), msgId=data.confirmationMessageId;
    const m=msgId?await tx.localWhatsAppMessage.findFirst({where:{accountId:d.accountId,conversationHash:d.conversationHash,messageId:msgId}}):null;
    if(m?.replyStatus!=='waiting_print')return;
    const order=await tx.localOrder.findUnique({where:{id:orderId}}), uncertain=jobs.some(x=>x.status!=='printed');
    await tx.localWhatsAppMessage.updateMany({where:{id:m.id,replyStatus:'waiting_print'},data:{replyStatus:'pending',replyText:`تم استلام الطلب ${order.displayId}.${uncertain?' تعذر تأكيد اكتمال الطباعة؛ يرجى مراجعة المتجر.':''}`,updatedAt:now()}});
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
          return await retry(()=>prisma.$transaction(tx=>createOrderInTransaction(tx,data,requestId,payload),txOptions));
        }
        case 'whatsapp.agent.personality.get': { const r=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-personality'}}); return r?validateAgentPersonality(parse(r.value)):{...DEFAULT_AGENT_PERSONALITY}; }
        case 'whatsapp.agent.personality.set': { const settings=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-settings'}}),currentSettings=settings?parse(settings.value):{}; if(currentSettings.enabled&&currentSettings.consentVersion === '2'&&currentSettings.consentAcceptedAt)throw new StoreError('AGENT_ENABLED','Stop the agent before editing its personality'); const r=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-personality'}}),old=r?parse(r.value):{}; const v=validateAgentPersonality({...old,...payload}); await prisma.localMetadata.upsert({where:{key:'whatsapp-agent-personality'},create:{key:'whatsapp-agent-personality',value:json(v)},update:{value:json(v)}}); return v; }
        case 'whatsapp.agent.settings.get': { const r=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-settings'}}); const v=r?parse(r.value):{}; return {enabled:!!v.enabled&&v.consentVersion === '2'&&!!v.consentAcceptedAt,consentVersion:v.consentVersion||null,consentAcceptedAt:v.consentAcceptedAt||null}; }
        case 'whatsapp.agent.settings.set': { const r=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-settings'}}),old=r?parse(r.value):{}; const accepted=payload.enabled===true&&payload.consentVersion === '2'; const v={enabled:accepted,consentVersion:accepted?'2':old.consentVersion||null,consentAcceptedAt:accepted?now():old.consentAcceptedAt||null}; await prisma.localMetadata.upsert({where:{key:'whatsapp-agent-settings'},create:{key:'whatsapp-agent-settings',value:json(v)},update:{value:json(v)}}); return v; }
        case 'whatsapp.message.ingest': { const {accountId,conversationHash,messageId,text,encryptedReplyTarget}=payload; if(!accountId||!conversationHash||!messageId||typeof text!=='string')throw new StoreError('INVALID_MESSAGE','Message identifiers and text are required'); const t=now(); try{return await prisma.$transaction(async tx=>{let c=await tx.localWhatsAppConversation.findUnique({where:{accountId_conversationHash:{accountId,conversationHash}}});if(!c)c=await tx.localWhatsAppConversation.create({data:{id:id('wac'),accountId,conversationHash,lastMessageAt:t,updatedAt:t}});const m=await tx.localWhatsAppMessage.create({data:{id:id('wam'),accountId,conversationHash,messageId,text,encryptedReplyTarget:encryptedReplyTarget||null,receivedAt:t,updatedAt:t}});await tx.localWhatsAppConversation.update({where:{id:c.id},data:{lastMessageAt:t,updatedAt:t}});return {duplicate:false,messageId:m.id};},txOptions);}catch(e){if(e.code==='P2002'){const m=await prisma.localWhatsAppMessage.findFirst({where:{accountId,conversationHash,messageId}});return {duplicate:true,messageId:m?.id||null};}throw e;} }
        case 'whatsapp.message.claim': { const {accountId,conversationHash,messageId}=payload, t=now(), staleMs=Number.isFinite(Number(payload.staleMs))&&Number(payload.staleMs)>=0?Number(payload.staleMs):300000;const row=await prisma.localWhatsAppMessage.findFirst({where:{accountId,conversationHash,messageId}});if(!row)return {claimed:false,reason:'not_found'};const conv=await prisma.localWhatsAppConversation.findUnique({where:{accountId_conversationHash:{accountId,conversationHash}}});if(conv?.state==='needs_staff')return {claimed:false,reason:'needs_staff'};const stale=row.status==='processing'&&Number(row.updatedAt)<=t-staleMs&&!row.replyText;const allowed=stale?{id:row.id,status:'processing',updatedAt:row.updatedAt,replyText:null}:{id:row.id,status:{in:['received','failed']}};const r=await prisma.localWhatsAppMessage.updateMany({where:allowed,data:{status:'processing',attempts:{increment:1},updatedAt:t}});return r.count?{claimed:true}:{claimed:false,reason:'not_claimable'}; }
        case 'whatsapp.message.recoverable': {const settingsRow=await prisma.localMetadata.findUnique({where:{key:'whatsapp-agent-settings'}}),settings=settingsRow?parse(settingsRow.value):{};if(!settings?.enabled||settings.consentVersion !== '2'||!settings.consentAcceptedAt)return [];const staleMs=Number.isFinite(Number(payload.staleMs))&&Number(payload.staleMs)>=0?Number(payload.staleMs):300000,cut=now()-staleMs;const rows=await prisma.localWhatsAppMessage.findMany({where:{OR:[{status:'received',replyId:null,replyText:null},{status:'processing',replyId:null,replyText:null,updatedAt:{lte:BigInt(cut)}}]},orderBy:{receivedAt:'asc'},take:100});return rows.map(row=>({accountId:row.accountId,conversationHash:row.conversationHash,messageId:row.messageId,text:row.text,encryptedReplyTarget:row.encryptedReplyTarget,receivedAt:Number(row.receivedAt)}));}
        case 'whatsapp.message.reply.recover': {const r=await prisma.localWhatsAppMessage.updateMany({where:{replyStatus:'sending'},data:{replyStatus:'unknown',status:'failed',updatedAt:now()}});return {recovered:r.count};}
        case 'whatsapp.print.recover': {return retry(()=>prisma.$transaction(async tx=>{const jobs=await tx.localPrintJob.findMany({where:{status:'printing'}});for(const j of jobs){await tx.localPrintJob.updateMany({where:{id:j.id,status:'printing'},data:{status:'unknown',errorCode:'INTERRUPTED_BY_RESTART',updatedAt:now()}});await finalizePrint(tx,j.orderId);}return {recovered:jobs.length};},txOptions));}
        case 'whatsapp.agent.snapshot': { const conv=await prisma.localWhatsAppConversation.findUnique({where:{accountId_conversationHash:{accountId:payload.accountId,conversationHash:payload.conversationHash}}});if(!conv)return null;const [messages,draft,menu,inventory,recipes]=await Promise.all([prisma.localWhatsAppMessage.findMany({where:{accountId:payload.accountId,conversationHash:payload.conversationHash},orderBy:{receivedAt:'desc'},take:15}),prisma.localWhatsAppDraft.findFirst({where:{accountId:payload.accountId,conversationHash:payload.conversationHash,status:{in:['collecting','awaiting_confirmation','confirmed']}},orderBy:{updatedAt:'desc'}}),prisma.localMenu.findMany({where:{kind:'item'},orderBy:{position:'asc'}}),prisma.localInventory.findMany(),prisma.localMenu.findMany({where:{kind:'recipe'}})]);return {conversation:{id:conv.id,accountId:conv.accountId,conversationHash:conv.conversationHash,state:conv.state,lastMessageAt:Number(conv.lastMessageAt),updatedAt:Number(conv.updatedAt)},messages:messages.reverse().map(x=>({...x,receivedAt:Number(x.receivedAt),updatedAt:Number(x.updatedAt)})),draft:draft?{...draft,createdAt:Number(draft.createdAt),updatedAt:Number(draft.updatedAt),data:parse(draft.data)}:null,menu:menu.map(x=>({...parse(x.data),id:x.id})),inventory:inventory.map(x=>({...parse(x.data),id:x.id,quantity:Number(x.quantity)})),recipes:recipes.map(x=>({...parse(x.data),id:x.id}))}; }
        case 'whatsapp.draft.update': {
          const {accountId,conversationHash,draftId}=payload;
          const existing=draftId?await prisma.localWhatsAppDraft.findUnique({where:{id:draftId}}):await prisma.localWhatsAppDraft.findFirst({where:{accountId,conversationHash,status:{in:['collecting','awaiting_confirmation']}}});
          const [menuRows,recipeRows,inventoryRows]=await Promise.all([
            prisma.localMenu.findMany({where:{kind:'item'}}),
            prisma.localMenu.findMany({where:{kind:'recipe'}}),
            prisma.localInventory.findMany(),
          ]);
          const menuById=new Map(menuRows.map(row=>[row.id,parse(row.data)]));
          const recipeById=new Map(recipeRows.map(row=>[row.id,parse(row.data)]));
          const remainingStock=new Map(inventoryRows.map(row=>[row.id,Number(row.quantity)]));
          const items=[],rejectedItems=[];
          const maximumQuantity=Math.min(20,Math.max(1,Number(payload.maximumQuantity)||20));
          for(const req of Array.isArray(payload.items)?payload.items:[]){
            const m=menuById.get(req?.itemId);
            if(!m){rejectedItems.push({itemId:req?.itemId,reason:'unknown_item'});continue;}
            if(m.isActive===false||m.available===false){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'inactive'});continue;}
            if(m.isWeightBased===true){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'unsupported_weight_based'});continue;}
            const q=Number(req.quantity),localPrice=Number(m.price);
            if(!Number.isInteger(q)||q<1||q>maximumQuantity){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'invalid_quantity'});continue;}
            if(!Number.isFinite(localPrice)||localPrice<0){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'invalid_local_price'});continue;}
            const recipe=recipeById.get(req.itemId),requirements=[];
            if(Array.isArray(recipe?.recipe)&&recipe.recipe.length){
              let invalidRecipe=false;
              for(const ingredient of recipe.recipe){
                const ingredientId=ingredient?.inventoryItemId,perUnit=Number(ingredient?.quantity);
                if(typeof ingredientId!=='string'||!ingredientId||!Number.isFinite(perUnit)||perUnit<0){invalidRecipe=true;break;}
                requirements.push([ingredientId,perUnit*q]);
              }
              if(invalidRecipe){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'invalid_recipe'});continue;}
            }else if(remainingStock.has(req.itemId))requirements.push([req.itemId,q]);
            const insufficient=requirements.some(([stockId,needed])=>!remainingStock.has(stockId)||remainingStock.get(stockId)<needed);
            if(insufficient){rejectedItems.push({itemId:req.itemId,name:m.name,reason:'unavailable_stock'});continue;}
            for(const [stockId,needed] of requirements)remainingStock.set(stockId,remainingStock.get(stockId)-needed);
            items.push({...m,id:req.itemId,quantity:q,notes:req.notes||'',price:localPrice});
          }
          const orderDetails=payload.orderDetails||{},customerPhone=payload.customerPhone||null;
          const subtotal=items.reduce((sum,x)=>sum+x.price*x.quantity,0);
          let discount=0;
          if(orderDetails.couponCode){const valid=await validateCoupon(orderDetails.couponCode);if(!valid.success)throw new StoreError('COUPON_INVALID','Coupon is invalid');const cp=valid.coupon;discount=cp.discountType==='percentage'?subtotal*Number(cp.discountValue)/100:Number(cp.discountValue);}
          const needsAddress=orderDetails.deliveryMethod==='delivery'&&!orderDetails.address;
          const needsDeliveryFee=orderDetails.deliveryMethod==='delivery';
          const data={items,orderDetails,customerPhone,needsDeliveryFee,summary:{subtotal,deliveryFee:0,discount,total:Math.max(0,subtotal-discount)}};
          const t=now(),changed=!existing||json(parse(existing.data))!==json(data),version=(existing?.version||0)+(changed?1:0);
          const row=existing?await prisma.localWhatsAppDraft.updateMany({where:{id:existing.id,status:existing.status,version:existing.version},data:{version,status:'collecting',summaryVersion:null,data:json(data),updatedAt:t}}):null;
          if(existing&&row.count!==1)throw new StoreError('DRAFT_CONFLICT','Draft changed concurrently');
          const saved=existing?await prisma.localWhatsAppDraft.findUnique({where:{id:existing.id}}):await prisma.localWhatsAppDraft.create({data:{id:draftId||id('wad'),accountId,conversationHash,status:'collecting',version,data:json(data),createdAt:t,updatedAt:t}});
          return {draft:{...saved,data:parse(saved.data),createdAt:Number(saved.createdAt),updatedAt:Number(saved.updatedAt)},rejectedItems,needsAddress,needsDeliveryFee};
        }
        case 'whatsapp.draft.awaiting': {const r=await prisma.localWhatsAppDraft.updateMany({where:{id:payload.draftId,status:'collecting',version:payload.expectedVersion},data:{status:'awaiting_confirmation',summaryVersion:payload.expectedVersion,updatedAt:now()}});const draft=await prisma.localWhatsAppDraft.findUnique({where:{id:payload.draftId}});return {draft:draft?{...draft,data:parse(draft.data),createdAt:Number(draft.createdAt),updatedAt:Number(draft.updatedAt)}:null,conflict:r.count!==1};}
        case 'whatsapp.draft.confirm': {return retry(()=>prisma.$transaction(async tx=>{const d=await tx.localWhatsAppDraft.findUnique({where:{id:payload.draftId}});if(!d)throw new StoreError('INVALID_DRAFT','Draft not found');if(d.orderId){const old=await tx.localOrder.findUnique({where:{id:d.orderId},include:{items:true}});return {order:orderView(old),replay:true};}if(parse(d.data)?.needsDeliveryFee)throw new StoreError('DELIVERY_FEE_UNAVAILABLE','Delivery cannot be confirmed until a local fee is configured');if(d.status!=='awaiting_confirmation'||d.summaryVersion!==payload.expectedVersion||d.version!==payload.expectedVersion)throw new StoreError('STALE_SUMMARY','Draft summary is stale');const linked=payload.confirmationMessageId?await tx.localWhatsAppMessage.findFirst({where:{accountId:payload.accountId,conversationHash:payload.conversationHash,messageId:payload.confirmationMessageId}}):null;if(!linked)throw new StoreError('INVALID_MESSAGE','Confirmation message not found');const updated=await tx.localWhatsAppDraft.updateMany({where:{id:d.id,status:'awaiting_confirmation',version:payload.expectedVersion,summaryVersion:payload.expectedVersion},data:{status:'confirmed',updatedAt:now()}});if(updated.count!==1)throw new StoreError('STALE_SUMMARY','Draft confirmation conflict');const data=parse(d.data),od=data.orderDetails||{}, customer={name:od.customerName||od.customer?.name||'',phone:payload.customerPhone||data.customerPhone||od.customerPhone||od.customer?.phone||'',address:od.address||od.customer?.address||''},orderData={customer,items:data.items,summary:{subtotal:data.summary.subtotal,deliveryFee:0,discount:data.summary.discount,total:data.summary.total},status:'Delivered',deliveryMethod:od.deliveryMethod||'pickup',paymentMethod:od.paymentMethod||'cash',couponCode:od.couponCode||null,source:'WHATSAPP',draftId:d.id,_requestId:`wa-draft:${d.id}`};const order=await createOrderInTransaction(tx,orderData,`wa-draft:${d.id}`);data.confirmationMessageId=linked.messageId;await tx.localWhatsAppDraft.update({where:{id:d.id},data:{status:'saved',orderId:order.id,data:json(data),updatedAt:now()}});const types=order.deliveryMethod==='delivery'?['kitchen','delivery']:order.deliveryMethod==='dine_in'?['kitchen','dine_in']:['kitchen','dine_in'];for(const invoiceType of types)await tx.localPrintJob.create({data:{id:id('print'),orderId:order.id,invoiceType,status:'pending',createdAt:now(),updatedAt:now()}});const replyId=crypto.randomUUID(),replyText='تم استلام طلبك وسيتم تأكيده بعد الطباعة.';await tx.localWhatsAppMessage.update({where:{id:linked.id},data:{replyId,replyText,replyStatus:'waiting_print',encryptedReplyTarget:payload.confirmationEncryptedReplyTarget||linked.encryptedReplyTarget,status:'processing',updatedAt:now()}});const parsed=orderView(await tx.localOrder.findUnique({where:{id:order.id},include:{items:true}}));return {order:parsed,printJobs:await tx.localPrintJob.findMany({where:{orderId:order.id}}),replay:false};},txOptions));}

        case 'whatsapp.conversation.handoff': return prisma.localWhatsAppConversation.update({where:payload.conversationId?{id:payload.conversationId}:{accountId_conversationHash:{accountId:payload.accountId,conversationHash:payload.conversationHash}},data:{state:'needs_staff',updatedAt:now()}});
        case 'whatsapp.conversation.resume': return prisma.localWhatsAppConversation.update({where:payload.conversationId?{id:payload.conversationId}:{accountId_conversationHash:{accountId:payload.accountId,conversationHash:payload.conversationHash}},data:{state:'active',updatedAt:now()}});
        case 'whatsapp.conversation.list': {const rows=await prisma.localWhatsAppConversation.findMany({orderBy:{lastMessageAt:'desc'},take:100});return Promise.all(rows.map(async c=>{const d=await prisma.localWhatsAppDraft.findFirst({where:{accountId:c.accountId,conversationHash:c.conversationHash,status:{in:['collecting','awaiting_confirmation']}},orderBy:{updatedAt:'desc'}});const x=d?parse(d.data):{};return {conversationId:c.id,state:c.state,timestamp:Number(c.lastMessageAt),draft:d?{status:d.status,version:d.version,itemCount:x.items?.length||0,total:x.summary?.total||0,deliveryFeePending:!!x.needsDeliveryFee}:null};}));}
        case 'whatsapp.message.reply.prepare': {const m=await prisma.localWhatsAppMessage.findFirst({where:{accountId:payload.accountId,conversationHash:payload.conversationHash,messageId:payload.messageId}});if(!m)throw new StoreError('INVALID_MESSAGE','Message not found');if(m.replyId)return {replyId:m.replyId,replyText:m.replyText,encryptedReplyTarget:m.encryptedReplyTarget,replyStatus:m.replyStatus,duplicate:true};const replyId=crypto.randomUUID();const r=await prisma.localWhatsAppMessage.updateMany({where:{id:m.id,replyId:null},data:{replyId,replyText:payload.replyText,replyStatus:'pending',encryptedReplyTarget:payload.encryptedReplyTarget,updatedAt:now()}});const fresh=await prisma.localWhatsAppMessage.findUnique({where:{id:m.id}});return {replyId:fresh.replyId,replyText:fresh.replyText,encryptedReplyTarget:fresh.encryptedReplyTarget,replyStatus:fresh.replyStatus,duplicate:r.count===0};}
        case 'whatsapp.message.reply.pending': return prisma.localWhatsAppMessage.findMany({where:{replyStatus:'pending'},orderBy:{updatedAt:'asc'},take:100}).then(rows=>rows.map(r=>({replyId:r.replyId,replyText:r.replyText,encryptedReplyTarget:r.encryptedReplyTarget,replyStatus:r.replyStatus})));
        case 'whatsapp.message.reply.claim': {const r=await prisma.localWhatsAppMessage.updateMany({where:{replyId:payload.replyId,replyStatus:'pending'},data:{replyStatus:'sending',updatedAt:now()}});return r.count===1?prisma.localWhatsAppMessage.findFirst({where:{replyId:payload.replyId}}):null;}
        case 'whatsapp.message.reply.complete': {const status=payload.status;if(!['sent','failed','unknown'].includes(status))throw new StoreError('INVALID_STATUS','Invalid reply status');const r=await prisma.localWhatsAppMessage.updateMany({where:{replyId:payload.replyId,replyStatus:'sending'},data:{replyStatus:status,status:status==='sent'?'replied':'failed',updatedAt:now()}});return r.count===1;}
        case 'whatsapp.print.pending': {const rows=await prisma.localPrintJob.findMany({where:{OR:[{status:'pending'},{status:'failed',attempts:{lt:2}}]},orderBy:{createdAt:'asc'},take:100,include:{order:{include:{items:true}}}});return rows.map(j=>({id:j.id,orderId:j.orderId,invoiceType:j.invoiceType,attempts:j.attempts,order:orderView(j.order)}));}
        case 'whatsapp.print.claim': {const r=await prisma.localPrintJob.updateMany({where:{id:payload.jobId,OR:[{status:'pending'},{status:'failed',attempts:{lt:2}}]},data:{status:'printing',attempts:{increment:1},updatedAt:now(),errorCode:null}});return r.count===1;}
        case 'whatsapp.print.complete': {if(!['printed','failed','unknown'].includes(payload.status))throw new StoreError('INVALID_STATUS','Invalid print status');const errorCode=payload.status==='unknown'?String(payload.errorCode||'PRINT_OUTCOME_UNKNOWN').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,64):payload.status==='failed'?String(payload.errorCode||'PRINT_FAILED').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,64):null;return retry(()=>prisma.$transaction(async tx=>{const j=await tx.localPrintJob.findUnique({where:{id:payload.jobId}});if(!j)throw new StoreError('PRINT_JOB_NOT_FOUND','Print job not found');if(j.status!=='printing')return j;await tx.localPrintJob.updateMany({where:{id:j.id,status:'printing'},data:{status:payload.status,errorCode,printedAt:payload.status==='printed'?BigInt(now()):null,updatedAt:now()}});await finalizePrint(tx,j.orderId);return tx.localPrintJob.findUnique({where:{id:j.id}});},txOptions));}

        case 'whatsapp.cleanup': {const days=Math.max(1,Math.min(365,Math.floor(Number(payload.days)||30))),cut=now()-days*86400000;const old=await prisma.localWhatsAppConversation.findMany({where:{lastMessageAt:{lt:cut}},select:{accountId:true,conversationHash:true}});for(const c of old)await prisma.localWhatsAppConversation.delete({where:{accountId_conversationHash:c}});return {deleted:old.length};}
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
