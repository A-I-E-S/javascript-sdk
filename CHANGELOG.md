# Changelog

## 0.2.0 — Unpublished

This release is prepared locally. It has not been published and no npm dist-tag has been changed.

### Breaking contract corrections

- Completed rate box/item numeric fields are numbers. UI drafts accept numbers or numeric strings and are completed with `completeRateRequest`.
- Rate item `price` and `product_hs_code_description` are optional.
- Purchase item `product_hs_code_description`, `documents_s3_key`, and `photos_s3_key` are optional.
- Shipment mode invariants are exact: SFN uses `cm`/`KG`, last-mile delivery, no pickup, and `NGN`; STN uses `inches`/`LBS`, pickup, no last-mile delivery, and `USD`.
- `preparePurchaseRequest` now accepts the selected `rate` object, validates its mode/currency, copies its `slug`, and emits purchase `currency`.
- `preparePurchaseRequest` validates real future-only assigned dates and numeric file flags before returning a purchase request; its optional `referenceDate` supports deterministic tests.
- Optional `file_is_url` is numeric `0 | 1`; `0` means purchase document response data is Base64 rather than URL data.
- Purchase address coordinates accept bounded finite decimal/scientific numeric strings as well as numbers and `null`; empty, hexadecimal, non-numeric, infinite, and out-of-range values are rejected.
- Purchase response waybill and insurance documents may be `null`; the invoice document remains required.

### Reliability and UI

- Rate response validation produces diagnosable API errors for malformed rate collections.
- Rate rendering accepts finite numeric-string amounts.
- Purchase confirmation renders unavailable optional documents without unsafe or invalid links.

See [Migrating to 0.2.0](./docs/migrating-to-0.2.md).
