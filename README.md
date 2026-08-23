# AfricanIES Shipping JavaScript SDK

Official TypeScript/JavaScript client and framework-neutral UI for AfricanIES shipping integrations.

> **Release status:** `@africanies/shipping@0.2.0` is published on npm and is the immutable stabilization baseline. Its exact source commit, npm publisher identity, and publication-approval provenance have not been verified; publication of any later version still requires separate approval.

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

Runtime Base64 credentials remain the selected integration model for the current stabilization work. The final policy for live browser integrations versus a backend/custom transport is pending; assess browser exposure before using a live credential.

## Package entry points

- `@africanies/shipping` — headless client and exact wire types
- `@africanies/shipping/server` — server-oriented helpers
- `@africanies/shipping/ui` — stage controllers and upload orchestration
- `@africanies/shipping/elements` — native custom elements
- `@africanies/shipping/browser` — client, controllers, and auto-registering elements for browser ESM

Detailed guides are under [`docs/`](./docs/).

Version `0.2.0` corrects shipment wire types based on observed rate and purchase payloads. It contains breaking TypeScript and rate-to-purchase adapter changes; see [the migration guide](./docs/migrating-to-0.2.md) and [changelog](./CHANGELOG.md).

Some implemented request details intentionally follow owner-confirmed sandbox evidence that differs from the public API documentation. Review [the API contract notes](./docs/api-contract.md); do not infer that these variances have been corrected in the public API/OpenAPI description.

## Development

```sh
npm install
npm run check
npm run build
npm test
```

No release or publication is authorized by implementation approval alone.
