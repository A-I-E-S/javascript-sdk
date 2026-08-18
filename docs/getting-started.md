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

`runtimeCredential` represents a credential supplied by your application at runtime. Do not copy a secret into browser source or a Vite environment variable: values compiled into frontend JavaScript are visible to users. For production integrations, prefer calling AfricanIES from your backend or provide a custom transport that calls your own authenticated backend.

The SDK defaults to `test`. Live traffic requires `environment: 'live'`.

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
