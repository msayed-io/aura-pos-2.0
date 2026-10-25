import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { UtilityServiceSupervisor } = require('../electron/service-supervisor.cjs');

class MockUtilityChild extends EventEmitter {
  constructor() {
    super();
    this.pid = undefined;
    this.killCalls = 0;
  }

  kill() {
    this.killCalls += 1;
    if (!Number.isInteger(this.pid)) return false;
    const killedPid = this.pid;
    setImmediate(() => {
      if (this.pid !== killedPid) return;
      this.pid = undefined;
      this.emit('exit', 0);
    });
    return true;
  }

  postMessage(message) {
    if (message?.command !== 'stop') return;
    setImmediate(() => {
      this.pid = undefined;
      this.emit('exit', 0);
    });
  }
}

function onceWithTimeout(emitter, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.removeListener(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    emitter.once(eventName, onEvent);
  });
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
  assert.ok(predicate(), 'Condition was not reached before timeout');
}

test('unspawned utility retries safely and a stale late spawn is killed', { timeout: 5000 }, async t => {
  const children = [];
  const logEntries = [];
  const supervisor = new UtilityServiceSupervisor({
    utilityProcess: {
      fork() {
        const child = new MockUtilityChild();
        children.push(child);
        if (children.length === 2) {
          setImmediate(() => {
            child.pid = 202;
            child.emit('spawn');
          });
        }
        return child;
      },
    },
    app: { getAppMetrics: () => [] },
    entry: path.join(process.cwd(), 'tests', 'fixtures', 'fake-worker.cjs'),
    spawnTimeoutMs: 20,
    startupTimeoutMs: 50,
    monitorIntervalMs: 2,
    forcedStopMs: 5,
    gracefulStopMs: 50,
    backoffBaseMs: 5,
    backoffMaxMs: 5,
    backoffJitter: 0,
    log: (code, context) => logEntries.push({ code, ...context }),
  });
  t.after(() => supervisor.stop().catch(() => {}));

  const restartPromise = onceWithTimeout(supervisor, 'restart-scheduled', 1000);
  supervisor.start();
  const [restart] = await restartPromise;
  assert.equal(restart.reason, 'spawn-timeout');
  await waitFor(() => children.length === 2 && children[1].pid === 202);

  const staleChild = children[0];
  assert.equal(staleChild.killCalls, 1);
  staleChild.pid = 101;
  staleChild.emit('spawn');
  await waitFor(() => staleChild.killCalls === 2 && staleChild.pid === undefined);

  assert.ok(logEntries.some(entry => entry.code === 'SERVICE_SPAWN_TIMEOUT'));
  assert.ok(logEntries.some(entry => entry.code === 'SERVICE_KILL_FAILED' && entry.reason === 'spawn-timeout'));
  assert.ok(logEntries.some(entry => entry.code === 'SERVICE_SPAWN_ABANDONED'));
  assert.ok(logEntries.some(entry => entry.code === 'SERVICE_LATE_SPAWN'));
  assert.ok(logEntries.some(entry => entry.code === 'SERVICE_RESTART_SCHEDULED' && entry.reason === 'spawn-timeout'));

  await supervisor.stop();
  assert.equal(supervisor.state, 'stopped');
});
