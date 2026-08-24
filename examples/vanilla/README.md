# Africanies Store — vanilla SDK UAT

This Vite application is a miniature e-commerce checkout for testing `@africanies/shipping`. It is intentionally sandbox-only and SFN-only: the sender is the fixed demo warehouse in Lagos, Nigeria, and the customer enters the receiver address.

The journey covers:

1. Enter a Base64 API credential and validate it with the authenticated carriers read endpoint.
2. Select catalogue items and quantities.
3. Type a human-readable product name. After three characters, the demo debounces Products API searches, cancels stale requests, and lets the tester select the returned HS classification by keyboard or pointer.
4. Enter the customer delivery address.
5. Use the SDK automatic packaging mode with a 1 cm allowance on every item dimension, a configurable box catalogue, and a 30 kg maximum gross weight.
6. Retrieve and select a carrier rate and include its `payment_amount` in the displayed order total.
7. Complete a clearly simulated PayDemo payment for the displayed merchandise plus delivery total. The demo retains PayDemo's full amount, currency, and reference. Because Africanies owns only delivery, shipment purchase separately binds that host-confirmed payment reference to the shipping portion through the SDK's intent-bound `purchaseAfterPayment()` helper.
8. Purchase with `file_is_url: 1` and the chosen `is_insured: '0' | '1'`, then show tracking, waybill, commercial invoice, and insurance documents returned by the API.

The credential is held in page memory only and cleared from the input after every validation outcome. After login, the login view is hidden and the authenticated header provides Logout. Logout discards the client and all checkout/session state, revokes generated document URLs, and returns to a fresh login view. Nothing is placed in storage, URLs, source, or logs. Base64 is reversible and browser users can inspect outbound authorization; use sandbox credentials only.

## Two independent demos

- [Hosted automatic checkout](https://a-i-e-s.github.io/javascript-sdk/) is the default configurable-box mini-commerce journey.
- [Hosted manual packaging lab](https://a-i-e-s.github.io/javascript-sdk/manual.html) is a separate host-integration surface. It exercises the SDK's manual packaging mode and requires the tester to provide every box and item dimension, gross/unit weight, quantity, value, and Products API classification. Manual mode is explicitly an integrating-application decision and is not presented as a customer checkout choice.

Both pages validate their own in-memory sandbox credential and provide Logout. They link to each other and are emitted as separate entries in the same GitHub Pages artifact.

The manual lab starts with the useful `0.2.0` UAT fixture: John Doe's Isolo/Lagos sender, Jane Smith's Boston receiver, one 10 × 10 × 10 cm box with 5 kg gross weight, and two quantity-one lines—Electronics Accessories at 1.5 kg/NGN 1,500 and Smartphone Case at 0.3 kg/NGN 1,500. The old fixture's hardcoded HS value is intentionally omitted: each item must be classified through the live searchable Products API combobox. Testers may add or remove boxes and items without an SDK-imposed demo limit; each item lives in exactly one box, box indexes remain stable, and the SDK validates dimensions, quantities, unit weights, values, and gross box weight before rates.

## Consumer integration choices

- **Headless APIs** — use the exported client, checkout, validation, and packaging functions when the host owns all rendering (server, framework, or native shell). Automatic configurable packaging is the recommended default.
- **SDK browser elements** — use `<africanies-shipment-builder>`, `<africanies-rate-selection>`, and `<africanies-purchase-confirmation>` when a browser host wants accessible SDK-provided workflow UI. The manual lab is a runnable shipment-builder example.
- **Fully custom host UI** — build any storefront UI while calling the same SDK APIs. The automatic demo is a runnable example: its catalogue, cart, address, packaging display, rates, PayDemo, tracking, and documents are host-rendered.

Manual packaging remains a host-application decision for merchants that already know the physical boxes. It is separate from the default automatic configurable-box workflow and is not an end-customer toggle. These demos are reference UAT surfaces, not a claim of parity with any production storefront.

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

The production build is static. The deployment workflow reads the configured GitHub Pages base path from `actions/configure-pages`, so unique-domain sites build at `/` while project sites retain their repository subpath. The deployed origin must be allowed by the Africanies sandbox CORS policy. Do not build a public artifact with `VITE_AFRICANIES_ENCODED_KEY` or any credential embedded in its environment.

The demo keeps one external reference and immutable purchase intent for an attempted order. A definitive validation or rejected API response can be corrected safely. If network delivery is uncertain, or the API response could follow an accepted request, the demo blocks automatic retry and directs the tester to reconcile that reference rather than risking a duplicate shipment.

URL documents are opened only over HTTPS. Base64 PDF downloads are decoded in memory only after format validation and are capped at 10 MB; malformed or oversized document data produces a clear unavailable state instead of an unbounded browser allocation.

The SDK still supports manual packaging for host applications that select that integration mode. The automatic storefront does not offer that choice to customers.
