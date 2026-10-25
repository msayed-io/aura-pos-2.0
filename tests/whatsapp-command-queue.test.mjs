import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSerialCommandQueue } = require('../electron/whatsapp-command-queue.cjs');

const tick = () => new Promise(resolve => setImmediate(resolve));

test('lifecycle commands execute in receipt order without overlapping async operations', async () => {
  const events = [];
  let active = 0;
  let maximumActive = 0;
  let releaseDisconnect;
  const disconnectGate = new Promise(resolve => { releaseDisconnect = resolve; });
  const enqueue = createSerialCommandQueue(async command => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    events.push(`start:${command}`);
    if (command === 'disconnect') await disconnectGate;
    events.push(`finish:${command}`);
    active -= 1;
  });

  const disconnect = enqueue('disconnect');
  const start = enqueue('start');
  const suspend = enqueue('suspend');
  await tick();
  assert.deepEqual(events, ['start:disconnect']);
  assert.equal(maximumActive, 1);

  releaseDisconnect();
  await Promise.all([disconnect, start, suspend]);
  assert.deepEqual(events, [
    'start:disconnect', 'finish:disconnect',
    'start:start', 'finish:start',
    'start:suspend', 'finish:suspend',
  ]);
  assert.equal(maximumActive, 1);
});

test('a rejected lifecycle command does not block later commands', async () => {
  const events = [];
  const enqueue = createSerialCommandQueue(async command => {
    events.push(command);
    if (command === 'broken') throw new Error('synthetic command failure');
    return 'completed';
  });

  const broken = enqueue('broken');
  const following = enqueue('following');
  await assert.rejects(broken, /synthetic command failure/);
  assert.equal(await following, 'completed');
  assert.deepEqual(events, ['broken', 'following']);
});
