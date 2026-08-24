# Africanies Store — vanilla SDK UAT

This Vite application is a miniature e-commerce checkout for testing `@africanies/shipping`. It is intentionally sandbox-only and SFN-only: the sender is the fixed demo warehouse in Lagos, Nigeria, and the customer enters the receiver address.

The journey covers:

1. Enter a Base64 API credential and validate it with the authenticated carriers read endpoint.
2. Select catalogue items and quantities.
3. Search the Africanies Products API by human-readable product name and select the returned HS classification.
4. Enter the customer delivery address.
5. Use the SDK automatic packaging mode with a 1 cm allowance on every item dimension, a configurable box catalogue, and a 30 kg maximum gross weight.
6. Retrieve and select a carrier rate and include its `payment_amount` in the displayed order total.
7. Complete a clearly simulated PayDemo payment. Shipment purchase is called only after PayDemo returns explicit success.
8. Purchase with `file_is_url: 1` and the chosen `is_insured: '0' | '1'`, then show tracking, waybill, commercial invoice, and insurance documents returned by the API.

The credential is held in page memory only and cleared from the input after validation. It is not placed in storage, URLs, source, or logs. Base64 is reversible and browser users can inspect outbound authorization; use sandbox credentials only.

## Local use

Node.js 22 or newer is required.

```sh
npm install
npm run dev
```

Run the deterministic demo-state tests and production build with:

```sh
npm test
npm run build
```

The production build is static and suitable for GitHub Pages. The deployed origin must be allowed by the Africanies sandbox CORS policy. Do not build a public artifact with `VITE_AFRICANIES_ENCODED_KEY` or any credential embedded in its environment.

The SDK still supports manual packaging for host applications that select that integration mode. The storefront does not offer that choice to customers; this demo’s host configuration selects automatic packaging.
