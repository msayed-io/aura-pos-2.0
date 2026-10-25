import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const token = process.env.AURA_AI_INSTALL_TOKEN;
const readyPath = process.env.AURA_WINDOWS_SMOKE_GATEWAY_READY;
if (typeof token !== 'string' || token.length < 32 || typeof readyPath !== 'string' || !path.isAbsolute(readyPath)) {
  process.exitCode = 2;
  throw new Error('WINDOWS_SMOKE_GATEWAY_CONFIGURATION_INVALID');
}

process.env.AURA_INSTALL_TOKEN_HASHES = createHash('sha256').update(token, 'utf8').digest('hex');
const { createGateway } = await import('../../mini-services/ai-gateway/server.mjs?windows-installed-smoke');
const gateway = createGateway({
  provider: async () => ({ reply: 'تم استقبال رسالة الاختبار.', intent: 'chat', items: [] }),
});
gateway.listen(0, '127.0.0.1');
await once(gateway, 'listening');
const address = gateway.address();
if (!address || typeof address !== 'object') {
  process.exitCode = 3;
  throw new Error('WINDOWS_SMOKE_GATEWAY_BIND_FAILED');
}
fs.mkdirSync(path.dirname(readyPath), { recursive: true });
fs.writeFileSync(readyPath, JSON.stringify({ port: address.port }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });

let closing = false;
function close() {
  if (closing) return;
  closing = true;
  gateway.close(() => process.exit(0));
  gateway.closeAllConnections?.();
  setTimeout(() => process.exit(0), 3000).unref?.();
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
