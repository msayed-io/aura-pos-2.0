import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function filesIn(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const name = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(name) : [name];
  });
}

test('only local base, health and the same-origin storage API routes are exposed', () => {
  assert.deepEqual(filesIn('src/app/api').filter((file) => /\/route\.[jt]s$/.test(file)).sort(), [
    'src/app/api/health/route.ts',
    'src/app/api/internal/shutdown/route.ts',
    'src/app/api/local-store/route.ts',
    'src/app/api/route.ts',
  ]);
});

test('Electron preload keeps explicit channels only and adds a display-ID-only new-order notice', () => {
  const preload = read('electron/preload.cjs');
  const exposed = [...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\(/gm)].map(match => match[1]);
  assert.deepEqual(exposed, ['getPrinters', 'print', 'savePrinterSettings', 'loadPrinterSettings', 'showNotification', 'notifyNewOrder']);
  assert.match(preload, /notifyNewOrder:\s*\(displayId\)\s*=>\s*ipcRenderer\.invoke\('orders:new-notification',\s*displayId\)/);
  assert.doesNotMatch(preload, /contextBridge\.exposeInMainWorld\('electronAPI',\s*\{[^}]*ipcRenderer[),]/s);
});

test('settings retain every POS tab and expose the Bot UI scaffold', () => {
  const ast = parse('src/aura/pages/SettingsPage.tsx');
  let tabType;
  const renderedTabs = [];
  const cases = [];
  walk(ast, (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'SettingsTab') tabType = node.type;
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'id' && ts.isStringLiteral(node.initializer)) renderedTabs.push(node.initializer.text);
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) cases.push(node.expression.text);
  });
  assert.ok(tabType && ts.isUnionTypeNode(tabType));
  const expected = ['menu', 'branding', 'offers', 'coupons', 'pricing', 'notifications', 'printing', 'botai', 'system'].sort();
  assert.deepEqual(tabType.types.map((node) => node.literal.text).sort(), expected);
  assert.deepEqual(renderedTabs.sort(), expected);
  assert.deepEqual(cases.sort(), expected);
});

test('analytics summary has no fetch, dynamic provider import or network client', () => {
  const file = 'src/aura/components/dashboard/pages/analytics/OverviewTab.tsx';
  const ast = parse(file);
  const dependencies = [];
  const networkCalls = [];
  walk(ast, (node) => {
    if (ts.isImportDeclaration(node)) dependencies.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || /(?:^|\.)(fetch|XMLHttpRequest|WebSocket|EventSource|generateContent)$/.test(name)) networkCalls.push(name);
    }
  });
  assert.deepEqual(dependencies.filter((name) => name.includes('/services/')).sort(), [
    '../../../../services/aiAnalyticsService',
    '../../../../services/fraudDetectionService',
  ]);
  assert.deepEqual(networkCalls, []);
  assert.match(read(file), /ملخص أداء اليوم/);
});

test('npm lock root matches every declared dependency group', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.deepEqual(lock.packages[''][group], manifest[group]);
  }
});

test('local environment template contains only the optional database setting', () => {
  const keys = read('.env.example').split('\n').filter((line) => line.trim() && !line.startsWith('#')).map((line) => line.split('=')[0]);
  assert.deepEqual(keys, ['DATABASE_URL']);
});

test('Bot UI is wired to settings and caller types without restoring removed engines', () => {
  const settings = read('src/aura/pages/SettingsPage.tsx');
  assert.match(settings, /import BotAIPage from ['"]\.\.\/components\/dashboard\/pages\/settings\/BotAIPage['"]/);
  assert.match(settings, /case 'botai':\s*return <BotAIPage\s*\/>/);
  for (const file of ['src/aura/App.tsx', 'src/aura/components/dashboard/Dashboard.tsx']) {
    const ast = parse(file);
    let tabType;
    walk(ast, node => {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === 'SettingsTab') tabType = node.type;
    });
    assert.ok(tabType && ts.isUnionTypeNode(tabType));
    assert.ok(tabType.types.some(node => ts.isLiteralTypeNode(node) && node.literal.text === 'botai'), `${file} must accept botai navigation`);
  }
  for (const file of [
    'src/aura/services/wakzService.ts', 'src/aura/services/geminiService.ts',
    'src/aura/types/wakzTypes.ts', 'src/app/api/wakz/[...path]/route.ts',
    'src/app/api/wakz-webhook/route.ts',
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must stay removed`);
  for (const file of filesIn('src').filter(file => /\.[jt]sx?$/.test(file))) {
    assert.doesNotMatch(read(file), /wakz|gemini|generativelanguage\.googleapis|@google\/generative-ai/i, `Legacy provider path in ${file}`);
  }
  const pkg = JSON.parse(read('package.json'));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(dependencies)) {
    assert.doesNotMatch(name, /wakz|gemini|generative-ai|baileys|whatsapp-web|z-ai-web-dev-sdk|qrcode/i, `Unexpected engine dependency: ${name}`);
  }
});
