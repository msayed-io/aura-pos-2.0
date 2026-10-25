/* eslint-disable @typescript-eslint/no-require-imports -- This Node maintenance script is CommonJS. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const runtimeDir = path.join(root, 'electron', 'whatsapp-runtime');
const manifestPath = path.join(runtimeDir, 'package.json');
const lockPath = path.join(runtimeDir, 'package-lock.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const pinned = '6.7.24';

if (manifest.dependencies?.['@whiskeysockets/baileys'] !== pinned
  || lock.packages?.['node_modules/@whiskeysockets/baileys']?.version !== pinned) {
  throw new Error('BAILEYS_PIN_OR_LOCK_MISMATCH');
}

const npmCli = process.env.npm_execpath;
if (typeof npmCli !== 'string' || !path.isAbsolute(npmCli) || !fs.existsSync(npmCli)) {
  throw new Error('RUN_WHATSAPP_RUNTIME_PREPARE_THROUGH_NPM');
}
const result = spawnSync(process.execPath, [npmCli,
  'ci', '--prefix', runtimeDir, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const installedManifest = JSON.parse(fs.readFileSync(
  path.join(runtimeDir, 'node_modules', '@whiskeysockets', 'baileys', 'package.json'),
  'utf8',
));
if (installedManifest.version !== pinned) throw new Error('BAILEYS_INSTALLED_VERSION_MISMATCH');
console.log(`WhatsApp runtime prepared from lockfile (${installedManifest.version}).`);
