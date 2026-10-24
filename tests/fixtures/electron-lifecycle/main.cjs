/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const path = require('node:path');
const { app, utilityProcess } = require('electron');
const { UtilityServiceSupervisor } = require('../../../electron/service-supervisor.cjs');

app.whenReady().then(() => {
  const productionService = process.env.AURA_TEST_REAL_SERVICE === '1';
  const supervisor = new UtilityServiceSupervisor({
    utilityProcess,
    app,
    entry: productionService
      ? path.join(__dirname, '../../../electron/whatsapp-service.cjs')
      : path.join(__dirname, 'worker.cjs'),
    serviceName: productionService ? 'Aura WhatsApp Service Smoke' : 'Aura Lifecycle Test Worker',
    heartbeatTimeoutMs: 500,
    startupTimeoutMs: 1000,
    monitorIntervalMs: 25,
    memoryLimitBytes: 512 * 1024 * 1024,
    backoffBaseMs: 80,
    backoffMaxMs: 160,
    backoffJitter: 0,
    gracefulStopMs: 1500,
    forcedStopMs: 1500,
    stdio: 'inherit',
    log: (event, context) => process.stdout.write(`SUPERVISOR ${JSON.stringify({ event, ...context })}\n`),
  });
  const readyGenerations = [];
  const newOrders = [];
  let rejectedMessages = 0;
  let restartScheduled = 0;
  let finished = false;
  const targetGeneration = productionService ? 1 : 3;
  const deadline = setTimeout(() => finish(new Error('lifecycle harness timed out')), 15000);

  supervisor.on('ready', ({ generation, pid }) => {
    readyGenerations.push(generation);
    if (generation !== targetGeneration || finished) return;
    const metric = app.getAppMetrics().find(item => item.pid === pid);
    const memoryKilobytes = metric?.memory?.privateBytes ?? metric?.memory?.workingSetSize ?? null;
    const memoryBytes = Number.isFinite(memoryKilobytes) ? memoryKilobytes * 1024 : null;
    setTimeout(() => supervisor.stop().then(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      const processAlive = (() => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } })();
      if (processAlive) throw new Error('utility child is still present after its exit event');
      finish(null, { readyGenerations, newOrders, rejectedMessages, restartScheduled, memoryBytes, stoppedPid: pid, processAlive });
    }).catch(error => finish(error)), productionService ? 0 : 100);
  });
  supervisor.on('protocol-rejected', () => { rejectedMessages += 1; });
  supervisor.on('new-order', event => { newOrders.push(event.displayId); });
  supervisor.on('restart-scheduled', () => { restartScheduled += 1; });
  supervisor.start();

  function finish(error, result) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    if (error) {
      process.stdout.write(`LIFECYCLE_RESULT ${JSON.stringify({ ok: false, error: error.message })}\n`);
      supervisor.stop().catch(() => {}).finally(() => app.exit(1));
      return;
    }
    process.stdout.write(`LIFECYCLE_RESULT ${JSON.stringify({ ok: true, productionService, ...result })}\n`);
    app.exit(0);
  }
}).catch(error => {
  process.stdout.write(`LIFECYCLE_RESULT ${JSON.stringify({ ok: false, error: error.message })}\n`);
  app.exit(1);
});
