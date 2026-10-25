import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRequire = createRequire(path.join(root, 'electron', 'whatsapp-runtime', 'package.json'));
const baileys = runtimeRequire('@whiskeysockets/baileys');

test('Baileys 6.7.24 multi-file auth state persists and reloads a synthetic fixture without network access', async t => {
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-baileys-auth-test-'));
  t.after(async () => { await fs.rm(sessionDir, { recursive: true, force: true }); });

  const first = await baileys.useMultiFileAuthState(sessionDir);
  first.state.creds.registered = true;
  first.state.creds.me = { id: 'fixture@s.whatsapp.net', name: 'Synthetic Fixture' };
  await first.saveCreds();
  assert.ok((await fs.readdir(sessionDir)).includes('creds.json'));

  const reopened = await baileys.useMultiFileAuthState(sessionDir);
  assert.equal(reopened.state.creds.registered, true);
  assert.equal(reopened.state.creds.me.id, 'fixture@s.whatsapp.net');
  assert.equal(reopened.state.creds.me.name, 'Synthetic Fixture');
  assert.equal(runtimeRequire('@whiskeysockets/baileys/package.json').version, '6.7.24');
});
