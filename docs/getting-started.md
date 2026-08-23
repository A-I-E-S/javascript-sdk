# Getting started

## Create a client

```ts
import { createAfricaniesClient } from '@africanies/shipping';

const client = createAfricaniesClient({
  environment: 'test',
  shipmentMode: 'SFN',
  auth: { encodedKey: runtimeCredential },
});
```

`runtimeCredential` represents a credential supplied by your application at runtime. Do not copy a secret into browser source or a Vite environment variable: values compiled into frontend JavaScript are visible to users. Runtime Base64 credentials remain the selected model for current stabilization, but the final live-browser-versus-backend/custom-transport policy is pending. Evaluate the exposure before supplying a live credential to browser code.

The SDK defaults to `test`. Live traffic requires `environment: 'live'`.

Custom `baseUrl` values must use HTTPS. Plain HTTP is accepted only for local development hosts: `localhost`, `127.0.0.1`, and `[::1]`.

The examples on this page describe the published `@africanies/shipping@0.2.0` contract. Version `0.2.0` is an immutable registry baseline: do not overwrite or republish it. Its exact source commit, npm publisher identity, and publication-approval provenance remain unverified.

| Environment | API origin |
|---|---|
| `test` | `https://api-sandbox.africaniestest.com` |
| `live` | `https://api.africanies.com` |

The SDK sends `Authorization`, `X-Shipment-Mode`, and `Content-Type: application/json`. It never sends `X-Account-Number`.

## Authentication

Pass either raw credentials or the already Base64-encoded `public_key:private_key` value:

```ts
auth: { publicKey, privateKey }
// or
auth: { encodedKey }
```

These forms are mutually exclusive. An `encodedKey` is not encoded again.

Base64 is not encryption. Browser consumers can inspect runtime credentials. Prefer a consumer backend and custom transport where the deployment threat model requires stronger isolation.

The public API documentation and owner-confirmed sandbox behavior still differ in material areas, including the account header, STN unit casing, delivery flags, some wire types, and purchase document nullability. This SDK follows the explicitly recorded behavior summarized in [API contract notes](./api-contract.md); those choices do not silently amend the public API/OpenAPI contract.

## Resource methods

```ts
await client.addresses.verify(address);
await client.files.generateUploadUrls({ files });
await client.products.search('smartphone');
await client.products.verify({ hs_code: '8517130000' });
await client.products.list();
await client.products.get(42);
await client.products.get('all');
await client.shipments.getRates(rateRequest);
await client.shipments.purchase(purchaseRequest);
await client.shipments.track(trackingNumber);
await client.carriers.list();
await client.carriers.get('all');
await client.warehouses.list();
await client.warehouses.get(42);
await client.warehouses.listByCountry('NG');
```

Omitting an optional product/carrier/warehouse selector returns a Laravel simple paginator. A supplied selector must be a positive integer or the exact string `all`.

## Signed uploads

```ts
const uploaded = await client.files.upload(file, {
  extension: 'pdf',
  mime_type: 'application/pdf',
  folder: 'documents/invoice',
});

console.log(uploaded.s3_key);
```

The SDK first generates a signed URL, then sends the raw file with presigned HTTP `PUT`. It uses the descriptor MIME type and does not forward AfricanIES authorization headers to S3.

## Rate to purchase

Pass the selected rate object to the conversion boundary so the SDK can preserve its slug and validate its mode/currency:

```ts
const prepared = preparePurchaseRequest(rateRequest, {
  assignedDate: '2099-08-20', // Replace with a real YYYY-MM-DD date after today.
  externalReference: 'ORDER-1001',
  rate: selectedRate,
  fileIsUrl: 0,
});

if (!prepared.success) {
  console.error(prepared.issues);
} else {
  await client.shipments.purchase(prepared.request);
}
```

`preparePurchaseRequest` returns `{ success: false, issues }` when `assignedDate` is not a real `YYYY-MM-DD` calendar date strictly after today. `fileIsUrl` is optional, but when supplied it must be the number `0` or `1`; string flags also return validation issues. Its optional `referenceDate` option is a deterministic test hook—omit it in production so validation uses the current date. `fileIsUrl: 0` requests Base64 document response data. The purchase element reports that the data is available for programmatic consumption without placing it in rendered HTML; do not log that data. SFN purchases use `NGN`; STN purchases use `USD`; the adapter validates the selected rate and emits the appropriate currency.

Purchase longitude and latitude keys are required but may contain a finite number, a decimal/scientific numeric string, or `null`. Longitude must remain within `-180...180` and latitude within `-90...90`; empty strings, hexadecimal strings, non-numeric text, `NaN`, and infinities fail validation.

## Errors

```ts
import { AfricaniesError } from '@africanies/shipping';

try {
  await client.shipments.getRates(request);
} catch (error) {
  if (error instanceof AfricaniesError) {
    console.error(error.category, error.status, error.message);
  }
}
```

Error categories distinguish configuration, validation, authentication, authorization, API, rate-limit, network, timeout, aborted, and upload failures. Signed URL query strings and authorization values are never included in SDK-generated messages.
