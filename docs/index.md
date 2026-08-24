# Start Here

Choose the path that matches what your application owns.

| Path | Choose it when | Start with |
|---|---|---|
| Automatic checkout (recommended) | The cart has unit weights/dimensions and the SDK should choose configured boxes | [Runnable Node checkout](../examples/headless-node/automatic-checkout.mjs) |
| Manual packaging | The host already knows each physical box and item assignment | [Manual packaging example](../examples/headless-node/manual-packaging.mjs) |
| SDK standalone UI | You want accessible framework-neutral builder, rate and purchase stages | [Standalone elements app](../examples/elements-standalone/) |
| Fully custom browser UI | Your storefront owns all rendering | [Live automatic UAT](https://a-i-e-s.github.io/javascript-sdk/) |
| Headless/server | Your backend owns credentials and orchestration | [Headless examples](../examples/headless-node/) |

The [live manual lab](https://a-i-e-s.github.io/javascript-sdk/manual.html) demonstrates host-controlled packaging. Both hosted demos are sandbox-only and accept a tester-supplied Base64 credential at runtime.

## Recommended journey

1. [Install and authenticate](./getting-started.md).
2. Search the Products API and retain the selected HS code.
3. Choose [automatic or manual packaging](./checkout-packaging.md).
4. Request rates and add the selected `payment_amount` to the host order total.
5. After host payment confirmation, bind the selected rate to one purchase intent.
6. Persist shipment, tracking and document details; never automatically retry an uncertain purchase.
7. Consult the [public API and example matrix](./api-reference.md).

Item `weight` is unit weight; line weight is `quantity × weight`. A Nigerian sender means SFN. A non-Nigerian sender means STN and requires a Nigerian receiver. `file_is_url: 1` requests URLs; omitted or `0` requests Base64, subject to each returned `*_is_url` flag.
