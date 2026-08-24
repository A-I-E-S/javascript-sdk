# AfricanIES Shipping JavaScript SDK

Official TypeScript/JavaScript client and framework-neutral UI for AfricanIES shipping integrations.

> **Release status:** `@africanies/shipping@0.4.0` is published on npm. This documentation-only source update prepares `0.4.1`; publishing it remains a separate, authorized release step.

## Live UAT Demo

Try the public, sandbox-only demos without installing the SDK:

- [Automatic checkout](https://a-i-e-s.github.io/javascript-sdk/) — the recommended default flow; the SDK selects from configurable boxes using cart quantities, unit weights, dimensions, protective allowance, and weight limits.
- [Manual packaging lab](https://a-i-e-s.github.io/javascript-sdk/manual.html) — the host application controls the physical boxes, item assignments, measurements, and gross weights. This is an integration choice, not a customer checkout option.

Both demos require your own sandbox Base64 API credential at runtime. Credentials are not included in the site or repository; use sandbox credentials only because Base64 is encoding, not encryption.

## Installation

```sh
npm install @africanies/shipping
```

## Quick start

```ts
import { createAfricaniesClient } from '@africanies/shipping';

const client = createAfricaniesClient({
  environment: 'test',
  auth: { encodedKey: 'BASE64_PUBLIC_KEY_COLON_PRIVATE_KEY' },
});

const rates = await client.shipments.getRates(rateRequest);
```

`test` is the default environment and uses `https://api-sandbox.africaniestest.com`. `live` uses `https://api.africanies.com` and must be selected explicitly.

Shipment direction is inferred per request. A Nigerian sender means SFN; a populated non-Nigerian sender means STN, which requires a Nigerian receiver. `shipmentMode` remains an optional legacy hint for an incomplete draft, but populated addresses are authoritative.

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

The browser UI is compiled with the exact Tailwind CSS v4 build toolchain during SDK development. Consumers do not install Tailwind or import a stylesheet: element styles are embedded in the browser/element bundles and isolated inside each Shadow Root. Headless, server, and controller-only entry points remain DOM- and CSS-free.

Detailed guides are under [`docs/`](./docs/), including [getting started](./docs/getting-started.md), [checkout packaging](./docs/checkout-packaging.md), and the [UI guide](./docs/ui.md). The canonical [live automatic UAT demo](https://a-i-e-s.github.io/javascript-sdk/) and [manual packaging lab](https://a-i-e-s.github.io/javascript-sdk/manual.html) exercise the published browser integration without embedding credentials.

Version `0.2.0` introduced shipment wire-type corrections based on observed rate and purchase payloads. It contains breaking TypeScript and rate-to-purchase adapter changes; see [the migration guide](./docs/migrating-to-0.2.md) and [changelog](./CHANGELOG.md).

Some implemented request details intentionally follow owner-confirmed sandbox evidence that differs from the public API documentation. Review [the API contract notes](./docs/api-contract.md); do not infer that these variances have been corrected in the public API/OpenAPI description.

## Checkout and packaging

`calculatePackaging()` is an optional host-facing preprocessor. Automatic mode is the new helper's default: it applies the configured allowance to every item's length, width, and height, performs deterministic three-dimensional placement, observes the global and per-box weight limits, and returns the existing `RateBox[]` contract plus a packaging breakdown. A host can instead pass `{ mode: 'manual', boxes }`; the existing builder and direct client methods are unchanged.

Item `weight` is always unit weight. The backend line weight is `quantity × weight`; the generated box weight is the combined contents and configured empty-box weight. Do not send the multiplied line weight as an item's unit weight.

`buildRateRequestFromPackaging()` adapts a complete result to the existing rates API, `selectCheckoutRate()` returns a validated numeric shipping cost, and `purchaseAfterPayment()` requires an explicit host payment confirmation before delegating to the existing purchase API. The low-level `client.shipments.purchase()` remains available for integrations that own their orchestration.

SFN means Ship From Nigeria and requires a Nigerian sender. STN means Ship To Nigeria and requires a Nigerian receiver. The UI validators enforce these invariants before rates and purchase.

The [vanilla UAT demo](./examples/vanilla/) is a test-mode, SFN-only mini checkout. Its Base64 credential is entered at runtime and kept in memory only.

## Development

```sh
npm install
npm run check
npm run build
npm test
```

No release or publication is authorized by implementation approval alone.
