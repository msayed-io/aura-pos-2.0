/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const fs = require('node:fs');
const { app } = require('electron');
const { acquireSingleInstance } = require('../../../electron/single-instance.cjs');

const userData = process.env.AURA_TEST_SINGLE_USER_DATA;
if (!userData) throw new Error('single instance test userData path is missing');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const secondary = process.env.AURA_TEST_SINGLE_ROLE === 'secondary';
const acquired = acquireSingleInstance(app, () => {
  process.stdout.write('SECOND_INSTANCE_FORWARDED\n');
  setTimeout(() => app.quit(), 1500);
});
process.stdout.write(`LOCK_DIAGNOSTIC ${JSON.stringify({ pid: process.pid, name: app.getName(), userData: app.getPath('userData'), acquired, secondary })}\n`);
if (!acquired) {
  process.stdout.write('SECONDARY_REJECTED\n');
  app.quit();
} else {
  app.whenReady().then(() => process.stdout.write(secondary ? 'UNEXPECTED_SECONDARY_READY\n' : 'PRIMARY_READY\n'));
}
