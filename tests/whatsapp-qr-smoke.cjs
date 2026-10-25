/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electron = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const fixture = path.join(__dirname, 'fixtures', 'whatsapp-qr');
const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-whatsapp-qr-smoke-'));

try {
  assert.ok(fs.existsSync(electron), `Electron binary not found: ${electron}`);
  const electronArgs = ['--no-sandbox', '--disable-gpu', fixture];
  const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
  const command = useXvfb ? 'xvfb-run' : electron;
  const args = useXvfb ? ['-a', electron, ...electronArgs] : electronArgs;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 70000,
    windowsHide: true,
    env: { ...process.env, AURA_WHATSAPP_SESSION_DIR: sessionDir },
  });
  assert.equal(result.error, undefined, `WhatsApp QR smoke could not start: ${result.error?.code || 'UNKNOWN'}`);
  assert.equal(result.status, 0, `WhatsApp QR smoke exited ${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
  assert.match(result.stdout, /WHATSAPP_QR_EVENT_RECEIVED/, `No QR event was received; output=${result.stdout}`);
  console.log('WhatsApp real-service QR smoke passed; QR payload was not logged or stored by the test runner.');
} finally {
  fs.rmSync(sessionDir, { recursive: true, force: true });
}
