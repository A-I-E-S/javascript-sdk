# Migrating to 0.2.0

Version `0.2.0` corrects the SDK contract to match observed shipment rate and purchase payloads. It is not source-compatible with every `0.1.0` TypeScript integration.

## Complete numeric rate drafts

Completed `ShipmentRateRequest` box dimensions, weights, indexes, quantities, amounts, and unit prices are numbers. `ShipmentRateDraft` and its draft box/item types accept form-friendly numeric strings.

```ts
import { completeRateRequest } from '@africanies/shipping/ui';

const rateRequest = completeRateRequest(draft);
```

Invalid or blank numeric values must be handled through `validateRateRequest` before completion. Rate item `price` and `product_hs_code_description` are optional and are omitted when absent.

## Apply the mode invariant

Use the exact values together:

| Mode | Units | Delivery flags | Purchase currency |
|---|---|---|---|
| SFN | `{ dimension: 'cm', mass: 'KG' }` | `last_mile_delivery: true`, `pickup: false` | `NGN` |
| STN | `{ dimension: 'inches', mass: 'LBS' }` | `last_mile_delivery: false`, `pickup: true` | `USD` |

The custom-element builder locks these fields. Headless requests that mix values from different modes fail validation.

## Pass the selected rate

Replace the `0.1.0` `shipmentMethodSlug` preparation option with the selected rate:

```ts
const prepared = preparePurchaseRequest(rateRequest, {
  assignedDate,
  externalReference,
  rate: selectedRate,
});
```

The adapter validates `selectedRate.mode` and `selectedRate.others.currency`, copies `selectedRate.slug` to `shipment_method_slug`, and emits `currency` as `NGN` for SFN or `USD` for STN.

Purchase item HS metadata and file-key arrays are optional. Missing values are omitted rather than replaced with invented descriptions or empty arrays.

## Update flags, coordinates, and document handling

- Change string `fileIsUrl: '0' | '1'` to numeric `fileIsUrl: 0 | 1`; `preparePurchaseRequest` returns field-addressable issues for string or otherwise invalid flags.
- Supply a real `assignedDate` in `YYYY-MM-DD` form that is strictly after today. The adapter validates it during preparation and revalidates before submission. Use the optional `referenceDate` only to make tests deterministic; omit it in production.
- `fileIsUrl: 0` means returned document fields contain Base64 document data, which must be treated as sensitive. The purchase element labels these values for programmatic consumption without embedding the Base64 content in its rendered HTML.
- Purchase coordinate keys remain required. Values may be finite numbers, decimal/scientific numeric strings, or `null`, within longitude `-180...180` and latitude `-90...90`; empty, hexadecimal, non-numeric, infinite, and out-of-range values are rejected.
- Check waybill and insurance documents for `null`. The invoice document remains required.

## Release sequencing

Do not update a registry dependency to `0.2.0` until that version is actually published. Before promotion, test the packed release tarball directly in a temporary consumer or with an npm `file:` dependency that is never committed.

The repository's private vanilla demo intentionally remains pinned to public `0.1.0` before release. Its isolated compatibility bridge supplies legacy-required item metadata, normalizes Stage 1 numeric and mode fields, completes missing purchase currency, and confines obsolete STN presentation units to the old component while preserving the canonical API request. Those shims are demo-only migration scaffolding, not part of the `0.2.0` SDK contract; do not copy them into new `0.2.0` integrations. Update the demo package and lockfile together only after `0.2.0` is public, then verify the bridge remains bypassed or remove it deliberately.
