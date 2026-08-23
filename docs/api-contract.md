# API contract notes

Version `0.2.0` follows observed shipment request and response payloads. Builder drafts accept numeric strings for form entry, but completed rate and purchase requests use numbers for box and item numeric fields.

## Shipment modes

Mode controls units, pickup, last-mile delivery, and purchase currency as one invariant:

| Mode | Dimension | Mass | `last_mile_delivery` | `pickup` | Currency |
|---|---|---|---|---|---|
| `SFN` | `cm` | `KG` | `true` | `false` | `NGN` |
| `STN` | `inches` | `LBS` | `false` | `true` | `USD` |

The builder locks these values to its client's shipment mode. Headless callers must provide the same exact values.

Rate item `price` and `product_hs_code_description` are optional. Purchase item `product_hs_code_description`, `documents_s3_key`, and `photos_s3_key` are also optional; the SDK does not fabricate absent metadata or empty file arrays.

## Rate to purchase

The selected rate `slug` is copied unchanged to purchase `shipment_method_slug`. The selected rate must match the shipment mode and its currency must be `NGN` for SFN or `USD` for STN. The prepared purchase request includes that mode-derived currency.

`completeRateRequest` is the explicit conversion boundary from form-friendly numeric strings to numeric rate fields. `preparePurchaseRequest` accepts the completed rate request and selected rate, then builds the purchase request. Invalid numeric values, invalid purchase dates or file flags, and mismatched selected rates return field-addressable issues rather than being silently replaced.

Purchase coordinate keys are required, but their values may be finite numbers, decimal/scientific numeric strings, or `null`, matching observed mixed coordinate values. Longitude is limited to `-180` through `180`; latitude is limited to `-90` through `90`. Empty strings, hexadecimal strings, non-numeric text, `NaN`, and infinities are rejected.

Optional `file_is_url` is strictly numeric `0 | 1`; string flags are rejected before purchase. A value of `0` means purchase document response fields contain Base64 document data instead of URLs. The purchase confirmation element labels that result for programmatic consumption without rendering, linking, or logging the Base64 content.

`assigned_date` must be a real calendar date in `YYYY-MM-DD` form and must be strictly after the current local date. Today, past dates, malformed dates, and impossible dates are rejected by `preparePurchaseRequest` and again before submission. The adapter's optional `referenceDate` exists for deterministic tests; production callers should omit it so the current date is used.

Purchase responses require an invoice document. Waybill and insurance documents may be `null`.

## Duplicate purchase

The API considers the same `external_reference` a duplicate after its associated shipment has been confirmed paid. Before paid confirmation the reference remains accepted. The SDK supplements the server rule with an in-flight UI lock and never automatically retries purchase.

## Files

File generation accepts objects containing `extension`, `mime_type`, and `folder`. The response supplies `upload_url` and `s3_key`. Upload uses presigned PUT; only a successfully uploaded `s3_key` should be attached to item-level `documents_s3_key` or `photos_s3_key` arrays.

Remote signed upload URLs must use HTTPS and are rejected before any file bytes are sent when they use plain HTTP. HTTP is accepted only for `localhost`, `127.0.0.1`, and `[::1]` development endpoints.

Invoices are documented as required for shipments to European countries. The exact country list and upload size/count limits are not yet published, so the SDK does not invent those constraints.
