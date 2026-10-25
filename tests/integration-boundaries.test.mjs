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
    'src/app/api/internal/whatsapp/route.ts',
    'src/app/api/local-store/route.ts',
    'src/app/api/route.ts',
  ]);
});

test('Electron preload keeps explicit printer, order and WhatsApp channels only', () => {
  const preload = read('electron/preload.cjs');
  const exposed = [...preload.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\(/gm)].map(match => match[1]);
  assert.deepEqual(exposed, ['getPrinters', 'print', 'savePrinterSettings', 'loadPrinterSettings', 'showNotification', 'notifyNewOrder', 'getWhatsAppStatus', 'connectWhatsApp', 'disconnectWhatsApp', 'onWhatsAppStatus', 'onWhatsAppQr']);
  assert.match(preload, /notifyNewOrder:\s*\(displayId\)\s*=>\s*ipcRenderer\.invoke\('orders:new-notification',\s*displayId\)/);
  assert.match(preload, /getWhatsAppStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('whatsapp:status:get'\)/);
  assert.match(preload, /connectWhatsApp:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('whatsapp:connect'\)/);
  assert.match(preload, /disconnectWhatsApp:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('whatsapp:disconnect'\)/);
  assert.match(preload, /ipcRenderer\.on\('whatsapp:qr'/);
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

test('packaged app copies the isolated WhatsApp runtime to resources and the worker resolves that path', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(pkg.build.extraResources, [
    { from: 'electron/whatsapp-runtime/package.json', to: 'whatsapp-runtime/package.json' },
    {
      from: 'electron/whatsapp-runtime/node_modules',
      to: 'whatsapp-runtime/node_modules',
      filter: ['**/*'],
    },
  ]);
  assert.doesNotMatch(pkg.build.asarUnpack.join('\n'), /whatsapp-runtime/);
  assert.match(read('electron/main.cjs'), /process\.resourcesPath, 'whatsapp-runtime', 'package\.json'/);
  assert.match(read('electron/service-supervisor.cjs'), /AURA_WHATSAPP_RUNTIME_PACKAGE/);
  assert.match(read('electron/whatsapp-service.cjs'), /createRequire\(runtimePackagePath\)/);
});

test('WhatsApp worker defers commands until local auth initialization settles', () => {
  const worker = read('electron/whatsapp-service.cjs');
  assert.match(worker, /createSerialCommandQueue\(async message => \{\s*await initializationPromise;\s*return runCommand\(message\);\s*\}\)/);
  assert.match(worker, /message\.command === 'reply'.*replyId.*jid.*text/s);
  assert.match(read('electron/service-supervisor.cjs'), /reply\(replyId, jid, text\)/);
  assert.match(worker, /initializationPromise = session\.initialize\(\);\s*await initializationPromise;/);
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
    assert.doesNotMatch(read(file), /(?:import\s+[^\n;]*(?:wakz|gemini)|require\(['"][^'"]*(?:wakz|gemini)|generativelanguage\.googleapis|@google\/generative-ai)/i, `Legacy provider path in ${file}`);
  }
  const pkg = JSON.parse(read('package.json'));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(dependencies)) assert.doesNotMatch(name, /wakz|gemini|generative-ai|baileys|whatsapp-web|z-ai-web-dev-sdk/i, `Unexpected provider/runtime dependency in root: ${name}`);
  assert.equal(pkg.dependencies['qrcode.react'], '4.2.0');
  const runtime = JSON.parse(read('electron/whatsapp-runtime/package.json'));
  const runtimeLock = JSON.parse(read('electron/whatsapp-runtime/package-lock.json'));
  assert.equal(runtime.dependencies['@whiskeysockets/baileys'], '6.7.24');
  assert.equal(runtimeLock.packages['node_modules/@whiskeysockets/baileys'].version, '6.7.24');
});

test('AI Gateway stays outside the EXE and only the internal route can process inbound orders', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.doesNotMatch(JSON.stringify(pkg.build.files), /mini-services/);
  assert.doesNotMatch(JSON.stringify(pkg.build.extraResources), /mini-services|GEMINI_API_KEY/);
  assert.match(pkg.scripts.test, /mini-services\/ai-gateway\/test\/\*\.test\.mjs/);
  const main = read('electron/main.cjs');
  assert.match(main, /const localServerEnv = \{ \.\.\.process\.env \}/);
  assert.match(main, /'GEMINI_API_KEY'.*delete localServerEnv\[name\]/);
  assert.doesNotMatch(main, /delete localServerEnv\['AURA_AI_INSTALL_TOKEN'\]/);
  const route = read('src/app/api/internal/whatsapp/route.ts');
  assert.match(route, /validateInternalCaller\(request\)/);
  assert.match(route, /'message\.process'/);
  assert.match(route, /'conversation\.cleanup'/);
  const rendererRoute = read('src/app/api/local-store/route.ts');
  assert.match(rendererRoute, /RENDERER_WHATSAPP_ACTIONS/);
  assert.doesNotMatch(rendererRoute, /'whatsapp\.draft\.confirm'|'message\.process'/);
  const agent = read('local-services/whatsapp-agent.cjs');
  assert.match(agent, /redactGatewayText\(message\.text/);
  assert.match(agent, /EMAIL_ADDRESS_GLOBAL/);
  assert.doesNotMatch(agent, /customerName:\s*redactGatewayText\(savedDetails/);
  assert.doesNotMatch(agent, /deliveryAddress:\s*redactGatewayText\(savedDetails/);
  for (const file of ['mini-services/ai-gateway/server.mjs', 'local-services/whatsapp-agent.cjs', 'electron/main.cjs']) {
    assert.doesNotMatch(read(file), /AIza[0-9A-Za-z_-]{30,}/, `Google API key literal in ${file}`);
  }
});

test('installed Windows load smoke is opt-in, packaged-only, synthetic and local', () => {
  const main = read('electron/main.cjs');
  const electronBuild = JSON.parse(read('package.json')).build;
  assert.ok(electronBuild.asarUnpack.includes('electron/whatsapp-*.cjs'));
  assert.match(main, /path\.join\(process\.resourcesPath, 'app\.asar\.unpacked', 'electron', 'whatsapp-service\.cjs'\)/);
  const serviceReadyWait = main.indexOf("serviceSupervisor.once('ready'");
  const syntheticLoad = main.indexOf('loadResults = await Promise.all');
  assert.ok(serviceReadyWait >= 0 && serviceReadyWait < syntheticLoad, 'The installed performance load must start after WhatsApp worker initialization.');
  assert.match(main, /if \(!installedSmoke \|\| installedSmokeStarted \|\| !app\.isPackaged\) return/);
  assert.match(main, /postInternalWhatsApp\('smoke\.enable-agent', \{\}\)/);
  assert.match(main, /text: `synthetic smoke conversation \$\{index\}`/);
  assert.match(main, /let mainWindowShowEvents = 0/);
  assert.match(main, /result\.trayHide = Boolean\(tray\) && !window\.isDestroyed\(\)/);
  assert.match(main, /SMOKE_WINDOW_SHOW_TIMEOUT/);
  assert.match(main, /result\.windowShown = mainWindowShowEvents > 0/);
  assert.match(main, /result\.ok = !error && result\.healthReady && result\.databaseReady && result\.windowShown/);
  assert.doesNotMatch(main, /startupTimeoutMs:\s*installedSmoke/);
  assert.match(main, /SMOKE_SERVICE_READY_TIMEOUT.*120000/);
  assert.match(main, /lastWhatsAppServiceErrorCode = errorCode/);
  assert.match(main, /result\.serviceStateAtExit = serviceSupervisor\.state/);
  assert.match(main, /result\.serviceRestartCount = serviceSupervisor\.restartCount/);
  assert.match(main, /result\.servicePidAtExit = serviceSupervisor\.snapshot\(\)\.pid/);
  assert.match(main, /whatsAppSupervisorLogCodes\.push\(code\)/);
  assert.match(main, /smokeLiveWhatsAppStates = new Set\(\['qr', 'connecting', 'reconnecting', 'connected'\]\)/);
  assert.match(main, /whatsappServiceStateAtSoakStart/);
  assert.match(main, /whatsappServiceStateAtSoakEnd/);
  const serviceSupervisorSource = read('electron/service-supervisor.cjs');
  assert.match(serviceSupervisorSource, /child\.once\('spawn', \(\) => this\.handleSpawn/);
  assert.match(serviceSupervisorSource, /SERVICE_SPAWN_TIMEOUT/);
  assert.match(serviceSupervisorSource, /SERVICE_SPAWN_ABANDONED/);
  assert.match(main, /SMOKE_RENDERER_METRICS_MISSING/);
  assert.match(main, /SMOKE_SERVER_METRICS_MISSING/);
  assert.match(main, /monitorEventLoopDelay\(\{ resolution: 1 \}\)/);
  assert.match(main, /mainEventLoopSamples < 100/);
  assert.match(main, /rendererWarmup = await window\.webContents\.executeJavaScript/);
  assert.match(main, /requestIdleCallback/);
  assert.match(main, /rendererEventLoopSamples < 100/);
  assert.match(main, /rendererEventLoopP95Ms/);
  assert.match(main, /rendererEventLoopMaxMs/);
  const route = read('src/app/api/internal/whatsapp/route.ts');
  assert.match(route, /case 'smoke\.enable-agent':[\s\S]*?process\.env\.AURA_INSTALLED_SMOKE !== '1'/);
  const agent = read('local-services/whatsapp-agent.cjs');
  assert.match(agent, /process\.env\.AURA_INSTALLED_SMOKE === '1'/);
  const health = read('src/app/api/health/route.ts');
  assert.match(health, /eventLoopSamples: smokeEventLoop\.count/);
  assert.match(main, /AURA_INSTALLED_SMOKE_READY/);
  assert.match(main, /AURA_INSTALLED_SMOKE_STOP/);
  assert.match(main, /soakDurationMs >= 10 \* 60 \* 1000/);
  assert.match(main, /result\.soakDurationMs = Date\.now\(\) - soakStartedAt/);
  assert.match(main, /result\.whatsappServiceMemoryMb = Math\.max/);
  const windowsSmoke = read('scripts/windows-installed-smoke.ps1');
  assert.match(windowsSmoke, /resources\/app\.asar\.unpacked\/electron/);
  assert.match(windowsSmoke, /whatsapp-command-queue\.cjs/);
  assert.match(windowsSmoke, /'windowShown'/);
  assert.match(windowsSmoke, /smokeError=\$smokeErrorCode/);
  assert.match(windowsSmoke, /serviceError=\$serviceErrorCode/);
  assert.match(windowsSmoke, /serviceState=\$serviceState/);
  assert.match(windowsSmoke, /exitReport\.errorCode/);
  assert.match(windowsSmoke, /soakDurationMs=\$exitSoakMs/);
  assert.match(windowsSmoke, /serviceStateAtSoakStart=\$exitSoakStartState/);
  assert.match(windowsSmoke, /supervisorEvents=\$exitEvents/);
  assert.match(windowsSmoke, /rendererEventLoopSamples -lt 100/);
  assert.match(windowsSmoke, /rendererEventLoopP95Ms/);
  assert.match(windowsSmoke, /rendererEventLoopMaxMs/);
  assert.match(windowsSmoke, /serviceRestarts=\$serviceRestartCount/);
  assert.match(windowsSmoke, /servicePid=\$servicePid/);
  assert.match(windowsSmoke, /supervisorEvents=\$supervisorEvents/);
  assert.match(windowsSmoke, /WhatsApp state at soak start\/end/);
  assert.match(windowsSmoke, /loadConversations.*loadReplies.*loadOrders/);
  assert.match(windowsSmoke, /mainEventLoopP99Ms.*serverEventLoopP99Ms.*rendererEventLoopP99Ms/);
  const installerStart = windowsSmoke.indexOf('$proc = Start-Process -FilePath $installer');
  const smokeEnvironmentSetup = windowsSmoke.indexOf("$env:AURA_INSTALLED_SMOKE = '1'");
  assert.ok(smokeEnvironmentSetup >= 0 && smokeEnvironmentSetup < installerStart, 'NSIS finish-page app must inherit the installed-smoke environment.');
  assert.match(windowsSmoke, /Using NSIS-launched installed app/);
  assert.match(windowsSmoke, /NSIS did not auto-launch the installed app/);
  assert.match(windowsSmoke, /AddMinutes\(10\)/);
  assert.match(windowsSmoke, /privatePeakGrowthPercent -gt 10\.0/);
  assert.match(windowsSmoke, /peakHandleGrowthPercent -gt 10\.0/);
  assert.match(windowsSmoke, /if \(!\$processCountStable\)/);
  assert.match(windowsSmoke, /if \(!\$processIdentityStable\)/);
  assert.match(windowsSmoke, /ParentProcessId/);
  assert.match(windowsSmoke, /CreationDate/);
  assert.match(windowsSmoke, /KernelModeTime/);
  assert.match(windowsSmoke, /PrivatePageCount/);
  assert.match(windowsSmoke, /observedProcessIdentities\.Contains/);
  assert.match(windowsSmoke, /lastFiveMinutesCoverageSeconds -lt 300/);
  assert.match(windowsSmoke, /cpuIntervalWeightSeconds -lt 300/);
  assert.match(windowsSmoke, /stableProcessIdentity = \$processIdentityStable/);
  assert.match(windowsSmoke, /idleApplicationCpuPercent -gt 2\.0/);
  assert.match(windowsSmoke, /LoadPercentage/);
  assert.match(windowsSmoke, /idleSystemCpuTarget0To2PercentMet/);
  assert.match(windowsSmoke, /systemCpuSamples\.Count -lt 100/);
  assert.match(windowsSmoke, /p99BaselineComparisonAvailable = \$false/);
  const supervisor = read('electron/service-supervisor.cjs');
  assert.match(supervisor, /memoryLimitBytes = 256 \* 1024 \* 1024/);
  const gateway = read('tests/fixtures/windows-smoke-gateway.mjs');
  assert.match(gateway, /provider: async \(\) => \(\{ reply: 'تم استقبال رسالة الاختبار\.'/);
  assert.doesNotMatch(gateway, /AIza|GEMINI_API_KEY/);
});

test('Windows release is master-only, versioned, run-owned and cleans only partial publication', () => {
  const workflow = read('.github/workflows/aura-pos-windows-release.yml');
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /publish:[\s\S]*?if: github\.ref == 'refs\/heads\/master'/);
  assert.match(workflow, /Calculate next semantic version after source tests/);
  assert.match(workflow, /npm version \$version --no-git-tag-version --allow-same-version/);
  assert.match(workflow, /Create draft, upload, verify and publish release transactionally/);
  assert.match(workflow, /git tag -a \$tag \$sha -m \$tagMarker/);
  assert.match(workflow, /Aura POS release run:\$env:GITHUB_RUN_ID/);
  assert.match(workflow, /workflow-run:\$env:GITHUB_RUN_ID/);
  assert.match(workflow, /gh release create \$tag[\s\S]*?--draft/);
  assert.match(workflow, /--verify-tag/);
  assert.match(workflow, /gh release edit \$tag[\s\S]*?--draft=false/);
  assert.match(workflow, /published\.assets\.Count -ne 1/);
  assert.match(workflow, /Remove incomplete release or tag after failure\/cancellation/);
  assert.match(workflow, /failure\(\) \|\| cancelled\(\)/);
  assert.match(workflow, /steps\.publish_release\.outcome != 'success'/);
  assert.match(workflow, /Preserved the fully published, verified release/);
  assert.match(workflow, /Refusing to delete tag \$tag without this run's ownership marker/);
  assert.match(workflow, /--cleanup-tag --yes/);
});

test('startup and periodic recovery resumes only stale inbound messages through the local queue', () => {
  const main = read('electron/main.cjs');
  assert.match(main, /postInternalWhatsApp\('message\.recoverable'\)/);
  assert.match(main, /postInternalWhatsApp\(resumeExisting \? 'message\.recover' : 'message\.process'/);
  assert.match(main, /incomingRecoveryTimer = setInterval\(\(\) => \{ void recoverStaleIncomingMessages\(\); \}, 60 \* 1000\)/);
  const route = read('src/app/api/internal/whatsapp/route.ts');
  assert.match(route, /'message\.recoverable'/);
  assert.match(route, /resumeExisting: true/);
  const store = read('local-services/store.cjs');
  assert.match(store, /status:'processing',replyId:null,replyText:null,updatedAt:\{lte:BigInt\(cut\)\}/);
  const rendererRoute = read('src/app/api/local-store/route.ts');
  assert.doesNotMatch(rendererRoute, /message\.recoverable|message\.recover/);
});
