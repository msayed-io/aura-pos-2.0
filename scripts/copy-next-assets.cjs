/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

function copy(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Missing build input: ${source}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

const root = process.cwd();
copy(path.join(root, '.next', 'static'), path.join(root, '.next', 'standalone', '.next', 'static'));
copy(path.join(root, 'public'), path.join(root, '.next', 'standalone', 'public'));
console.log('Copied Next static and public assets into standalone output.');
