# Changelog

## 0.3.0 — Unreleased

Release candidate for the additive checkout, automatic-packaging, SDK validation, UI-parity, browser-recovery, and hosted vanilla UAT work. Package metadata now identifies `0.3.0`; publication is not implied or authorized by this entry.

### Checkout and packaging

- Added host-selected automatic packaging with configurable per-axis protective allowance, box catalogues, rotation, maximum gross weight, deterministic multi-box placement, and a detailed packaging breakdown.
- Preserved manual host-supplied boxes as an explicit compatible mode.
- Item `weight` is validated and transmitted as unit weight; line and box checks derive physical content weight as `quantity × unit weight` to prevent avoidable `424` responses.
- Added quote-bound rate selection and immutable purchase intents that bind host payment confirmation to the selected shipping amount, currency, rate, and shipment request without taking ownership of merchandise payment.

### Shipment contracts

- SDK rate and purchase boundaries now enforce SFN Nigerian-sender and STN Nigerian-receiver geography before network requests.
- Added strict address, mode/unit, box, item, quantity, unit-weight, currency, insurance, and document-format validation for headless and SDK UI flows.
- Purchase preparation preserves optional `is_insured: '0' | '1'`; omitted or zero `file_is_url` retains Base64 document semantics while `file_is_url: 1` requests document URLs.

### UI and UAT demo

- Added Products API-backed human-readable product search and HS-code selection, explicit unit-weight guidance, expanded review/rate/purchase presentation, and responsive/accessibility refinements.
- Reworked the vanilla example into an SFN-only mini-commerce UAT flow with a Lagos warehouse sender, cart, receiver address, automatic packaging, rates, PayDemo gate, tracking, and returned documents.
- Added GitHub Pages build/deployment safeguards and expanded Playwright coverage across desktop and mobile browser projects.

### Reliability and security

- Custom elements now treat their assigned client as authoritative for environment and shipment-mode attributes, and mode-dependent stages reject mismatched requests before making an API call.
- Purchase operations are cancelled when their request or client changes, preventing a stale in-flight response from replacing newer state.
- Live API base URLs and presigned upload URLs require HTTPS, with a loopback HTTP exception for local development and tests.
- Regression tests cover client-authoritative rendering, mode preflight, stale purchase cancellation, and transport URL enforcement.
- Release, migration, getting-started, and security documentation now reflects the immutable published `0.2.0` baseline, unresolved provenance and API variances, and the pending final live-browser credential policy.

## 0.2.0 — Published 2026-08-18

This version is published on npm as `@africanies/shipping@0.2.0` and is now an immutable stabilization baseline. Do not overwrite or republish it. Registry inspection confirms the version and publication timestamp, but the exact source commit, npm publisher identity, and publication-approval provenance remain unverified.

The contract corrections below reflect owner-confirmed sandbox evidence. Material differences from the public API documentation remain tracked and must not be interpreted as corrections to the public API/OpenAPI description.

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
