import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(root, '.next', 'standalone', 'server.js');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const fixture = path.join(root, 'tests', 'fixtures', 'electron-window');

test('a real Electron window hides without destruction while standalone health stays ready and WAL shutdown is authorized', { timeout: 60000, skip: !fs.existsSync(serverEntry) ? 'Run npm run build before this smoke test.' : false }, () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-electron-window-'));
  const shutdownToken = randomBytes(32).toString('hex');
  try {
    const args = ['--no-sandbox', '--disable-gpu', fixture];
    const command = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : electronExe;
    const commandArgs = command === 'xvfb-run' ? ['-a', electronExe, ...args] : args;
    const result = spawnSync(command, commandArgs, {
      cwd: root,
      encoding: 'utf8',
      timeout: 55000,
      windowsHide: true,
      env: { ...process.env, AURA_ELECTRON_WINDOW_DATA_DIR: dataDir, AURA_ELECTRON_WINDOW_TOKEN: shutdownToken },
    });
    assert.equal(result.error, undefined, result.error?.message || 'Electron window smoke failed to start');
    assert.equal(result.status, 0, `Electron window smoke exited ${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
    const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('WINDOW_SERVER_RESULT '));
    assert.ok(line, `window smoke report missing; stdout=${result.stdout}; stderr=${result.stderr}`);
    const report = JSON.parse(line.slice('WINDOW_SERVER_RESULT '.length));
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.readyToShow, true);
    assert.equal(report.visibleBefore, true);
    assert.equal(report.hiddenAfterClose, true);
    assert.equal(report.destroyedAfterClose, false);
    assert.equal(report.hiddenEvents, 1);
    assert.equal(report.healthStatus, 200);
    assert.equal(report.healthDatabase, 'ready');
    assert.equal(report.checkpointStatus, 200);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
