/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = path.resolve(__dirname, '../../../node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
const appDir = __dirname;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-single-instance-'));
const env = { ...process.env, AURA_TEST_SINGLE_USER_DATA: userData };
const processes = [];

function launch(role) {
  const child = spawn(electron, ['--no-sandbox', '--disable-gpu', appDir], {
    cwd: path.resolve(__dirname, '../../..'),
    env: { ...env, AURA_TEST_SINGLE_ROLE: role },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.outputText = '';
  child.stderrText = '';
  child.stdout.on('data', chunk => { child.outputText += chunk.toString(); });
  child.stderr.on('data', chunk => { child.stderrText += chunk.toString(); });
  processes.push(child);
  return child;
}

function waitForText(child, text, timeoutMs = 10000) {
  if (child.outputText.includes(text)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${text}: ${child.outputText} ${child.stderrText}`)); }, timeoutMs);
    const check = () => { if (child.outputText.includes(text)) { cleanup(); resolve(); } };
    const exit = code => { cleanup(); reject(new Error(`process exited ${code} before ${text}: ${child.outputText} ${child.stderrText}`)); };
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', check); child.off('exit', exit); };
    child.stdout.on('data', check);
    child.on('exit', exit);
    check();
  });
}

function waitExit(child, timeoutMs = 10000) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`process exit timeout: ${child.outputText} ${child.stderrText}`)); }, timeoutMs);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

(async () => {
  try {
    const primary = launch('primary');
    await waitForText(primary, 'PRIMARY_READY');
    const secondary = launch('secondary');
    await waitForText(secondary, 'SECONDARY_REJECTED');
    const secondaryCode = await waitExit(secondary);
    if (secondaryCode !== 0) throw new Error(`secondary Electron exited with ${secondaryCode}`);
    await waitForText(primary, 'SECOND_INSTANCE_FORWARDED');
    const primaryCode = await waitExit(primary);
    if (primaryCode !== 0) throw new Error(`primary Electron exited with ${primaryCode}`);
    process.stdout.write(JSON.stringify({ ok: true, secondRejected: true, firstNotified: true, noExtraWindow: !primary.outputText.includes('UNEXPECTED_SECONDARY_READY') }) + '\n');
    process.exitCode = 0;
  } catch (error) {
    const states = processes.map(child => ({ pid: child.pid, exitCode: child.exitCode, output: child.outputText, stderr: child.stderrText }));
    process.stderr.write(`${error.message}\n${JSON.stringify(states)}\n`);
    process.exitCode = 1;
  } finally {
    for (const child of processes) if (child.exitCode === null) child.kill();
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})();
