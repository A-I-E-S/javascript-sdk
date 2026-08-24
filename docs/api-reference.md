# Public API and example coverage

## Entry points

| Import | Registers elements | Use |
|---|---:|---|
| `@africanies/shipping` | No | Headless client, validation, packaging and checkout |
| `@africanies/shipping/server` | No | Server client/auth/wire types |
| `@africanies/shipping/ui` | No | Controllers and request validation |
| `@africanies/shipping/elements` | Yes | Custom elements and registration |
| `@africanies/shipping/browser` | Yes | Browser client, UI and elements |

## Runtime exports

| Exports | Example |
|---|---|
| `createAfricaniesClient`, `AFRICANIES_ENVIRONMENTS`, `resolveAuthorization` | [resources](../examples/headless-node/resources.mjs) |
| `createFetchTransport` | [transport and upload](../examples/headless-node/transport-and-upload.mjs) |
| `AfricaniesError`, `categoryForStatus`, `redactUrl` | [validation/errors](../examples/headless-node/validation-and-errors.mjs) |
| `inferShipmentMode`, `isNigeriaCountry`, `shipmentGeographyIssues`, `assertShipmentGeography`, `shipmentRequestIssues`, `assertShipmentRequest` | [validation/errors](../examples/headless-node/validation-and-errors.mjs) |
| `calculatePackaging` | [automatic](../examples/headless-node/automatic-checkout.mjs), [manual](../examples/headless-node/manual-packaging.mjs) |
| `buildRateRequestFromPackaging`, `createCheckoutShippingQuote`, `selectCheckoutRate`, `createCheckoutPurchaseIntent`, `purchaseAfterPayment` | [automatic checkout](../examples/headless-node/automatic-checkout.mjs) |
| `completeRateRequest`, `validateRateRequest`, `validatePurchaseRequest`, `validateShipmentGeography`, `validateShipmentUnits`, `preparePurchaseRequest` | [validation/errors](../examples/headless-node/validation-and-errors.mjs), [automatic checkout](../examples/headless-node/automatic-checkout.mjs) |
| `ShipmentBuilderController`, `RateSelectionController`, `PurchaseController`, `UploadController` | [controller usage](./ui.md#controller-only-usage) |
| `AfricaniesElement`, `AfricaniesShipmentBuilderElement`, `AfricaniesRateSelectionElement`, `AfricaniesPurchaseConfirmationElement`, `defineAfricaniesElements` | [standalone elements](../examples/elements-standalone/) |

## Client resource coverage

| Methods | Example |
|---|---|
| `addresses.verify` | [resources](../examples/headless-node/resources.mjs) |
| `files.generateUploadUrls`, `files.upload` | [transport and upload](../examples/headless-node/transport-and-upload.mjs) |
| `products.search`, `products.verify`, `products.list`, `products.get` | [resources](../examples/headless-node/resources.mjs) |
| `shipments.getRates`, `shipments.purchase` | [automatic checkout](../examples/headless-node/automatic-checkout.mjs) |
| `shipments.track`, `carriers.list`, `carriers.get`, `warehouses.list`, `warehouses.get`, `warehouses.listByCountry` | [resources](../examples/headless-node/resources.mjs) |

All methods accept an optional `AbortSignal`. List methods return an array or simple paginator inside `ApiEnvelope`. Exact public wire, draft, state, packaging, transport and result types are emitted through the corresponding entry point.

## Element contract

| Element | Properties | Events |
|---|---|---|
| `<africanies-shipment-builder>` | `client`, `value`, `config`, `environment`, `shipmentMode` | `africanies-change`, `africanies-complete` |
| `<africanies-rate-selection>` | `client`, `request`, `environment`, `shipmentMode` | `africanies-rate-selected`, `africanies-complete`, `africanies-error` |
| `<africanies-purchase-confirmation>` | `client`, `request`, `environment`, `shipmentMode` | `africanies-purchased`, `africanies-complete`, `africanies-error` |

Events bubble and cross the Shadow DOM boundary. Rate event details are `{ rate, request }`; purchase completion details are the API envelope. Assigning `client` projects its environment and legacy mode hint to the element.
