'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createLocalStore } = require('../../local-services/store.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGatewayClient, processWhatsAppMessage } = require('../../local-services/whatsapp-agent.cjs');

async function main() {
  const store = createLocalStore({ dataDir: process.env.AURA_TEST_DATA_DIR, seed: false, autoBackup: false });
  await store.initialize();
  const input = {
    accountId: 'primary',
    conversationHash: 'e'.repeat(64),
    messageId: 'crash-during-gateway-1',
    text: 'مرحباً',
    encryptedReplyTarget: 'opaque-encrypted-jid-reference',
    customerPhone: '',
  };
  process.stdout.write('READY\n');
  const operation = processWhatsAppMessage(store, input, {
    gatewayRequest: createGatewayClient({
      gatewayUrl: process.env.AURA_TEST_GATEWAY_URL,
      installToken: process.env.AURA_TEST_INSTALL_TOKEN,
      timeoutMs: 60_000,
    }),
    resumeExisting: process.env.AURA_TEST_RECOVER === '1',
  });
  process.stdout.write('PROCESSING\n');
  const result = await operation;
  process.stdout.write(`DONE ${JSON.stringify({ ignored: result?.ignored === true, hasReply: Boolean(result?.reply), hasOrder: Boolean(result?.order) })}\n`);
  await store.checkpointAndClose();
}

main().catch(error => {
  process.stderr.write(`WORKER_FAILED ${String(error?.code || error?.name || 'ERROR')}\n`);
  process.exitCode = 1;
});
