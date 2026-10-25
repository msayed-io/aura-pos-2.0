import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const driver = path.join(root, 'tests', 'fixtures', 'electron-single-instance', 'driver.cjs');

test('two real Electron processes share one instance lock and notify the primary process', { timeout: 30000 }, () => {
  const command = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : process.execPath;
  const args = command === 'xvfb-run' ? ['-a', process.execPath, driver] : [driver];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 25000, windowsHide: true });
  assert.equal(result.error, undefined, result.error?.message || 'single instance driver failed to start');
  assert.equal(result.status, 0, `single instance driver exited ${result.status}; stdout=${result.stdout}; stderr=${result.stderr}`);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(report, { ok: true, secondRejected: true, firstNotified: true, noExtraWindow: true });
});
