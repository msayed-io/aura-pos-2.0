/* eslint-disable @typescript-eslint/no-require-imports -- Electron test fixture. */
'use strict';

const path = require('node:path');
const { app, utilityProcess } = require('electron');
const { UtilityServiceSupervisor } = require('../../../electron/service-supervisor.cjs');

const sessionDir = process.env.AURA_WHATSAPP_SESSION_DIR;
let supervisor;
let finished = false;
let deadline;

function finish(errorCode) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  const stop = supervisor ? supervisor.stop() : Promise.resolve();
  void stop.then(() => {
    if (errorCode) process.stdout.write(`WHATSAPP_QR_SMOKE_FAILED ${errorCode}\n`);
    app.exit(errorCode ? 1 : 0);
  }, () => {
    process.stdout.write('WHATSAPP_QR_SMOKE_FAILED SERVICE_STOP_UNCONFIRMED\n');
    app.exit(1);
  });
}

app.whenReady().then(() => {
  if (typeof sessionDir !== 'string' || !path.isAbsolute(sessionDir)) return finish('SESSION_DIR_UNAVAILABLE');
  supervisor = new UtilityServiceSupervisor({
    utilityProcess,
    app,
    entry: path.join(__dirname, '../../../electron/whatsapp-service.cjs'),
    serviceName: 'Aura WhatsApp QR smoke',
    heartbeatTimeoutMs: 20000,
    startupTimeoutMs: 20000,
    monitorIntervalMs: 1000,
    backoffBaseMs: 500,
    backoffMaxMs: 2000,
    backoffJitter: 0,
    gracefulStopMs: 3000,
    forcedStopMs: 2000,
    childEnv: {
      AURA_WHATSAPP_SESSION_DIR: sessionDir,
      AURA_WHATSAPP_RUNTIME_PACKAGE: path.join(__dirname, '../../../electron/whatsapp-runtime/package.json'),
    },
    stdio: 'ignore',
    log: code => process.stdout.write(`WHATSAPP_SUPERVISOR_${code}\n`),
  });
  supervisor.on('ready', () => {
    if (!supervisor.command('start')) finish('START_COMMAND_REJECTED');
  });
  supervisor.on('qr', qr => {
    if (typeof qr === 'string' && qr.length > 0) {
      process.stdout.write('WHATSAPP_QR_EVENT_RECEIVED\n');
      finish(null);
    }
  });
  supervisor.on('error-code', errorCode => process.stdout.write(`WHATSAPP_SERVICE_${errorCode}\n`));
  supervisor.on('status', snapshot => {
    if (snapshot.state === 'needs-attention') finish('SERVICE_NEEDS_ATTENTION');
  });
  deadline = setTimeout(() => finish('QR_TIMEOUT'), 60000);
  supervisor.start();
}).catch(() => finish('ELECTRON_START_FAILED'));
