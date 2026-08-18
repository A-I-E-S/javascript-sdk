# AfricanIES Shipping vanilla example

This private Vite app consumes the registry-published `@africanies/shipping@0.1.0` package through its browser entry point. It demonstrates the three custom-element stages:

The dependency intentionally remains pinned to `0.1.0` while `0.2.0` is unpublished. After `0.2.0` is approved and visible on the public registry, update both `package.json` and `package-lock.json` together and rerun the full demo flow. Do not point this installable example at a nonexistent registry version.

1. build and validate a shipment;
2. request and select a rate;
3. convert the selected rate `slug` to `shipment_method_slug` and purchase the shipment.

Use Node.js 22 or newer:

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run build
```

The encoded API key entered in the form is cleared from the input after client creation and is never logged. For local development only, you may copy `.env.example` to the ignored `.env.local` and set `VITE_AFRICANIES_ENCODED_KEY`; the demo pre-fills the password input from that local value on page load and Reset. Vite compiles every `VITE_*` value into the browser bundle, so never deploy or share a build produced with that variable set. Prefer entering a test credential into the form after the dev server starts. Test mode is the default. Live mode requires confirmation during configuration and a second confirmation before the live purchase stage.

The shipment builder starts with the documentation sample populated (John Doe in Isolo to Jane Smith in Boston, one box, and two items). For compatibility with the pinned `0.1.0` builder, the demo derives its two legacy-required optional fields without changing the supplied values: `price` equals each item's `unit_price`, and `product_hs_code_description` equals its `description`. Candidate `0.2.0` accepts both as optional metadata. SFN uses `cm`/`KG`, last-mile delivery, and no pickup; STN uses `inches`/`LBS`, pickup, and no last-mile delivery. Reset restores the SFN sample values, keeps the page's generated external reference stable, and advances the assigned date to the earliest allowed date (tomorrow).

The demo also has an explicit pre-publication compatibility boundary. It normalizes Stage 1's legacy string numbers and legacy mode units to the `0.2.0` numeric and mode-specific rate wire contract before requesting rates. After the pinned `0.1.0` purchase adapter runs, it verifies the selected rate currency and adds the mode currency only when the legacy adapter omitted it. For legacy STN only, the old confirmation component receives its obsolete unit spelling for local validation while a scoped client wrapper sends the untouched canonical `inches`/`LBS` request to the API. These operations are idempotent and bypassed when the demo is later upgraded to `0.2.0`; addresses are preserved unchanged.

Back and Reset only change or clear the demo's local UI state. They cannot cancel or revoke a purchase request once it has been sent, including an in-flight live purchase.
