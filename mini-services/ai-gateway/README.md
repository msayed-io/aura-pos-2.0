# Aura POS — Gemini AI Gateway (reference)

Standalone Node.js Gateway service for `POST /v1/agent/respond`. It uses only Node built-ins, keeps Gemini credentials and a fixed system prompt server-side, validates both JSON boundaries, and never creates orders. Aura POS includes a local client for this contract; deploy this directory as an independent service. The service itself and its Gemini key are not bundled into the POS EXE.

## Requirements and setup

Node.js 20 or newer. No package installation is required. Configure secrets in the service manager/secret store, not in a checked-in file. Required environment variables:

- `GEMINI_API_KEY`: server-side Gemini API key; never put it in the client or logs.
- `AURA_INSTALL_TOKEN_HASHES`: comma-separated lowercase SHA-256 hashes of allowed per-install bearer tokens. Issue a random high-entropy token out-of-band, deliver it to its one installation, and keep only its hash in this allowlist.

For each Aura POS installation, inject `AURA_AI_GATEWAY_URL` and its matching raw `AURA_AI_INSTALL_TOKEN` into the desktop process environment using a secure service manager/secret store. The local POS server receives those two values server-side only; it strips Gemini API key variables from its environment. Do not put the install token or `GEMINI_API_KEY` in this repository, the renderer, or the EXE.

Generate a hash without putting the token in shell history or command arguments, by prompting silently (the token is not echoed):

```sh
read -rsp 'Install token: ' TOKEN; printf '\n'; printf %s "$TOKEN" | sha256sum | cut -d' ' -f1; unset TOKEN
```

Use a secure secret manager/input method to enter the token at the prompt. Do not save the token or place it in command-line arguments. Rotate by replacing/removing its hash and securely replacing the installation token.

Optional environment variables: `PORT` (default `8080`), `HOST` (default `127.0.0.1`), `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_BASE_URL` (default `https://generativelanguage.googleapis.com`; intended for controlled endpoint testing), `MAX_BODY_BYTES` (default `16384`), `RATE_LIMIT_PER_MINUTE` (default `30` per token), and `PROVIDER_TIMEOUT_MS` (default `15000`). Invalid positive-integer settings fail startup. Do not expose the test endpoint override to untrusted configuration.

Start and test:

```sh
npm start
npm test
```

## API contract

`GET /health` returns `{"status":"ok"}` and discloses no configuration. `POST /v1/agent/respond` requires `Authorization: Bearer <install-token>` and JSON. Unknown keys or invalid field types/limits are rejected. The accepted body is exactly:

```json
{"conversationHash":"<64 lowercase hex>","messages":[{"role":"customer","text":"..."}],"menu":[{"id":"item-id","name":"Item","price":50,"available":true}],"draft":{"id":null,"version":0,"status":"collecting","items":[]},"orderDetails":{"deliveryMethod":"delivery","paymentMethod":"cash"}}
```

Input `menu.price` comes only from the current local menu and is context for item selection; the local POS recalculates every line and total, and never trusts a model-provided price. Optional input `orderDetails` accepts only `deliveryMethod` (`pickup` or `delivery`), `couponCode` (≤80 chars), and `paymentMethod` (`cash`, `vodafone`, `instapay`, or `etisalat`). Stored customer-name/address fields and phone/JID/email keys are not accepted in input context. The result has required `reply`, `intent`, and `items`; optional output `orderDetails` may additionally contain `customerName` (≤120 chars) and `deliveryAddress` (≤300 chars) extracted from the necessary recent customer messages. Names/addresses may remain inside message text sent with explicit consent, but the local client redacts phone/JID/email patterns, including item notes. The Gateway rejects these detectable identifiers in all string fields. The response schema never accepts prices or extras, and the service never creates orders. Request bodies, tokens, provider bodies and personal identifiers are not logged; client errors are generic.

## Deployment security

Run behind an HTTPS reverse proxy/load balancer (for example Caddy or nginx) with TLS, request-body limits at the proxy, and restricted network access; do not expose plain HTTP to the public internet. Keep the application bound to loopback unless a private service network requires otherwise. Apply service-manager secret injection, least privilege, firewall rules, monitoring that records status/latency only, and regular token rotation. The current rate limiter is in-memory and per process/token; use a shared limiter or gateway-level controls when running multiple replicas. `/health` is intentionally unauthenticated and minimal.

## Gemini model and verification caveat

Default model ID is `gemini-3.8-flash`, based on the official Google model documentation: [models catalog](https://ai.google.dev/gemini-api/docs/models) and [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Tests route to a local HTTP provider harness and do **not** establish that a live Gemini API key, account, model availability, quota, or network call works. The API key is read only from server `process.env`.
