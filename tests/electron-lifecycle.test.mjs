import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const fixture = path.join(root, 'tests', 'fixtures', 'electron-lifecycle');
const MIB = 1024 * 1024;

function runElectron(env = {}) {
  assert.ok(fs.existsSync(electronExe), `Electron executable not found: ${electronExe}`);
  const args = ['--no-sandbox', '--disable-gpu', fixture];
  const command = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : electronExe;
  const commandArgs = command === 'xvfb-run' ? ['-a', electronExe, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: 25000,
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, result.error?.message || 'Electron lifecycle process failed to start');
  assert.equal(result.status, 0, `Electron lifecycle process exited ${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
  const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('LIFECYCLE_RESULT '));
  assert.ok(line, `Electron lifecycle result missing; stdout=${result.stdout}; stderr=${result.stderr}`);
  const report = JSON.parse(line.slice('LIFECYCLE_RESULT '.length));
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.processAlive, false);
  assert.ok(Number.isFinite(report.memoryBytes) && report.memoryBytes > 0, JSON.stringify(report));
  return report;
}

test('real Electron utility service rejects forged IPC, recovers from crashes, and exits without an orphan', { timeout: 30000 }, () => {
  const report = runElectron();
  assert.equal(report.productionService, false);
  assert.deepEqual(report.readyGenerations, [1, 2, 3]);
  assert.deepEqual(report.newOrders, ['TEST-001']);
  assert.equal(report.rejectedMessages, 1);
  assert.ok(report.restartScheduled >= 2);
});

test('production WhatsApp service skeleton starts and stops as a real utility process under its measured memory cap', { timeout: 30000 }, () => {
  const report = runElectron({ AURA_TEST_REAL_SERVICE: '1' });
  assert.equal(report.productionService, true);
  assert.deepEqual(report.readyGenerations, [1]);
  assert.deepEqual(report.newOrders, []);
  assert.equal(report.restartScheduled, 0);
  assert.ok(report.memoryBytes < 256 * MIB, `Measured worker memory ${report.memoryBytes} exceeds the documented 256 MiB limit`);
});
