# AfricanIES Shipping JavaScript SDK

Official TypeScript/JavaScript client and framework-neutral UI for AfricanIES shipping integrations.

> **Implementation status:** pre-release `0.1.0`. The public API may change before the first approved release.

## Installation

```sh
npm install @africanies/shipping
```

## Quick start

```ts
import { createAfricaniesClient } from '@africanies/shipping';

const client = createAfricaniesClient({
  environment: 'test',
  shipmentMode: 'SFN',
  auth: { encodedKey: 'BASE64_PUBLIC_KEY_COLON_PRIVATE_KEY' },
});

const rates = await client.shipments.getRates(rateRequest);
```

`test` is the default environment and uses `https://api-sandbox.africaniestest.com`. `live` uses `https://api.africanies.com` and must be selected explicitly.

Authentication can be provided as an already encoded API key or as raw keys:

```ts
auth: { encodedKey: '...' }
// or
auth: { publicKey: '...', privateKey: '...' }
```

Base64 is reversible encoding, not encryption. Never embed a credential in a published bundle, source map, repository, or log.

## Package entry points

- `@africanies/shipping` — headless client and exact wire types
- `@africanies/shipping/server` — server-oriented helpers
- `@africanies/shipping/ui` — stage controllers and upload orchestration
- `@africanies/shipping/elements` — native custom elements
- `@africanies/shipping/browser` — client, controllers, and auto-registering elements for browser ESM

Detailed guides are under [`docs/`](./docs/).

## Development

```sh
npm install
npm run check
npm run build
npm test
```

No release or publication is authorized by implementation approval alone.
