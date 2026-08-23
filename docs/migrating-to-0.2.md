# Migrating to 0.2.0

Version `0.2.0` corrects the SDK contract to match observed shipment rate and purchase payloads. It is not source-compatible with every `0.1.0` TypeScript integration.

`@africanies/shipping@0.2.0` is published and immutable. Its exact source commit, npm publisher identity, and publication-approval provenance have not been verified. The migration guidance documents the published contract without inferring that provenance.

Some `0.2.0` behavior follows owner-confirmed sandbox evidence where the public API documentation differs. Review [API contract notes](./api-contract.md) and retain those variance assumptions in consumer tests.

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
Rate-selection controllers now validate the complete request against the client's mode before making a network call. Replacing an SFN client with an STN client therefore requires replacing or rebuilding the request with the STN units and delivery flags above.

When a client is assigned to a custom element, its `environment` and `shipmentMode` are authoritative. Later conflicting `environment` or `shipment-mode` attribute changes are synchronously restored to the client values. Purchase elements also discard in-flight state and suppress stale completion or error events when detached or when their request/client is replaced.

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

Version `0.2.0` is already published, so consumers may pin or update to that exact version after completing the migration checks above. Do not overwrite or republish `0.2.0`. Before promoting any later release, test its packed tarball directly in a temporary consumer or with an npm `file:` dependency that is never committed, then obtain separate publication approval.

If a private vanilla demo or other consumer remains pinned to `0.1.0`, its compatibility bridge may supply legacy-required item metadata, normalize Stage 1 numeric and mode fields, complete missing purchase currency, and confine obsolete STN presentation units to the old component while preserving the canonical API request. Those shims are demo-only migration scaffolding, not part of the `0.2.0` SDK contract; do not copy them into new `0.2.0` integrations. Update each consumer package and lockfile together, then verify that the bridge is bypassed or remove it deliberately.
