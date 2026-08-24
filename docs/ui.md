# AfricanIES Shipping UI

For a complete three-stage host application, see the [standalone elements example](../examples/elements-standalone/). After `npm run build`, serve the repository root and open `http://localhost:8000/examples/elements-standalone/`. The full custom storefront remains available at https://a-i-e-s.github.io/javascript-sdk/.

See the UI in the canonical sandbox-only [automatic UAT demo](https://a-i-e-s.github.io/javascript-sdk/) or compare the [host-controlled manual packaging lab](https://a-i-e-s.github.io/javascript-sdk/manual.html). Both accept a tester-provided sandbox Base64 credential at runtime; no credential is shipped with the pages.

The package provides three independently mountable native custom elements:

- `<africanies-shipment-builder>`
- `<africanies-rate-selection>`
- `<africanies-purchase-confirmation>`

Importing the elements entry registers all three:

```ts
import '@africanies/shipping/elements';
```

For a browser-focused ESM entry that includes the client, controllers, and auto-registering elements, use:

```ts
import { createAfricaniesClient } from '@africanies/shipping/browser';
```

The package also ships a classic-script build for CDNs and direct hosting:

```html
<script src="/path/to/africanies-shipping.global.js"></script>
<script>
  const client = AfricaniesShipping.createAfricaniesClient({
    environment: 'test',
    shipmentMode: 'SFN',
    auth: { encodedKey: runtimeCredential },
  });
</script>
```

The global build registers the custom elements and exposes the same client and UI exports on `globalThis.AfricaniesShipping`. Supply credentials at runtime; never compile a secret into a public script.

## Styling and CSP

Tailwind CSS is a build-time development dependency only. The elements bundle contains one compiled stylesheet, shared through constructable stylesheets where supported and inserted as a Shadow DOM `<style>` fallback elsewhere. Applications do not need Tailwind, a Tailwind configuration, or a global CSS import. CSS custom properties such as `--africanies-accent` remain the public theming seam.

The demo emits hashed external CSS and requires no CSS CDN, remote font, `eval`, or runtime scanner. The constructable stylesheet path also performs no network or dynamic code evaluation. Applications using the fallback `<style>` path must allow package-owned inline element styles in their `style-src` policy; the SDK does not claim nonce propagation for that fallback.

## Shipment Builder

```ts
const builder = document.querySelector('africanies-shipment-builder');
builder.client = client;
builder.value = initialRateRequest;

builder.addEventListener('africanies-complete', (event) => {
  console.log(event.detail); // validated ShipmentRateRequest
});
```

The builder can start empty or with consumer-supplied data. It emits `africanies-change` as its draft changes and blocks completion until required fields and mode-specific units validate. In the Items step, users search the Africanies Products API by a human-readable description and select a returned product; the component supplies that result's HS code without exposing a manual HS-code input. A host may still pre-populate an already classified item programmatically.

For SFN, Stage 1 presents four steps: Sender, Receiver, Items, and Summary. The API-owned transport values remain locked to centimetres, kilograms, last-mile delivery enabled, and pickup disabled; there is no customer-facing drop-off step. Insurance is an explicit Yes/No choice in Summary and is serialized before rates are requested. Coordinates are not editable controls. Host-provided finite coordinates round-trip, an address provider may populate them, and manual addresses use `null` rather than fabricated coordinates.

Country/state data and Google Places integration are optional, additive host configuration:

```ts
builder.config = {
  countries: [{ code: 'NG', name: 'Nigeria', states: [{ code: 'LA', name: 'Lagos' }] }],
  googlePlaces: {
    // Supply a restricted browser key at runtime, never through a public build variable.
    apiKey: runtimeRestrictedKey,
    loader: async (key) => hostPlacesAdapter(key),
  },
};
```

Without configuration, accessible manual address entry and a small built-in country/state list remain available. A host may instead supply `loadCountries`, an already-created Places `provider`, or a loader that returns one. The SDK never places the key in shipment values, events, rendered markup, storage, or logs. Restrict browser keys by referrer and API in Google Cloud; applications that cannot safely expose a restricted browser key should inject a server-backed provider/proxy. Provider failures are announced and fall back to manual entry.

## Rate Selection

```ts
const rates = document.querySelector('africanies-rate-selection');
rates.client = client;
const completedRateRequest = completeRateRequest(rateDraft);
rates.request = completedRateRequest;

rates.addEventListener('africanies-complete', (event) => {
  const { rate, request } = event.detail;
  console.log(rate.slug, request);
});
```

Stage 2 can be mounted without Stage 1. It handles loading, empty, error, refresh, and selected states.

## Purchase and Confirmation

```ts
const purchase = document.querySelector('africanies-purchase-confirmation');
purchase.client = client;
purchase.request = completePurchaseRequest;
```

Stage 3 applies an in-flight lock, never automatically retries purchase, and reuses its successful response for repeated UI submissions. The API defines duplicates using `external_reference` after the associated shipment is confirmed paid.

In `0.2.0`, Stage 1 completes numeric box/item fields through `completeRateRequest`. Stage 2 passes the complete selected rate to the consumer. Pass that rate to `preparePurchaseRequest`; its `slug` becomes `shipment_method_slug`, and its mode/currency is checked before Stage 3.

`preparePurchaseRequest` rejects an `assigned_date` that is not a real `YYYY-MM-DD` calendar date strictly after today and returns field-addressable issues before Stage 3 is mounted. Stage 3 repeats that validation immediately before submission. When present, `file_is_url` must be the number `0` or `1`; string flags such as `'0'` and `'1'` are invalid. The adapter's optional `referenceDate` is for deterministic tests and should be omitted in production.

Waybill and insurance documents can be unavailable (`null`). The invoice document is required. Stage 3 labels unavailable documents instead of producing invalid links and labels insurance as not requested when `is_insured` is not `"1"`. When a document's corresponding `*_is_url` flag is `0`, Stage 3 reports that Base64 data was returned for programmatic consumption without rendering, linking, or logging the Base64 content. Remote tracking and document links must use HTTPS; HTTP links are accepted only for loopback development hosts.

## Test mode

Every independently mounted stage reads the client environment. In `test`, a persistent text-labelled **TEST MODE** marker is rendered and `data-environment="test"` is exposed on the host element. Live mode does not display the marker.

## Styling

Elements use Shadow DOM and expose semantic CSS custom properties:

```css
africanies-shipment-builder {
  --africanies-primary: #1c2b3f;
  --africanies-accent: #1cbd5d;
  --africanies-import: #f08829;
  --africanies-surface: #f9fafb;
  --africanies-danger: #c00b19;
}
```

Layouts use responsive, touch-friendly controls, visible keyboard focus, semantic progress and async/error regions, and reduced-motion handling. Their hierarchy is informed by the canonical Africanies application, but the package does not claim pixel parity or replace consumer accessibility testing in the application's supported browsers and assistive technologies.

## Controller-only usage

Applications that own rendering can import the same state machines without registering elements:

```ts
import {
  ShipmentBuilderController,
  RateSelectionController,
  PurchaseController,
  UploadController,
  preparePurchaseRequest,
} from '@africanies/shipping/ui';
```

Each controller exposes immutable `state`, calls a subscriber immediately through `subscribe(listener)`, and returns an unsubscribe function. `ShipmentBuilderController.replace/validate/complete` owns drafts; `RateSelectionController.load/select/cancel` owns rate loading; `PurchaseController.submit/cancel` locks purchase submission; and `UploadController.add/upload/retry/remove` owns signed uploads. See the [API matrix](./api-reference.md) for their entry point and related request validators.
