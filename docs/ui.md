# AfricanIES Shipping UI

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

## Shipment Builder

```ts
const builder = document.querySelector('africanies-shipment-builder');
builder.client = client;
builder.value = initialRateRequest;

builder.addEventListener('africanies-complete', (event) => {
  console.log(event.detail); // validated ShipmentRateRequest
});
```

The builder can start empty or with consumer-supplied data. It emits `africanies-change` as its draft changes and blocks completion until required fields and mode-specific units validate.

## Rate Selection

```ts
const rates = document.querySelector('africanies-rate-selection');
rates.client = client;
rates.request = completeRateRequest;

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

Layouts are mobile-first, controls use touch-friendly sizing, state is never communicated by color alone, and async/error states use semantic live or alert regions.

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
