# Checkout packaging

Automatic packaging is optional and additive. Existing applications can continue to construct `ShipmentRateRequest.boxes` themselves or use the existing shipment builder. A host that opts into the helper gets automatic mode by omitting `mode`; a host selects manual mode explicitly with `{ mode: 'manual', boxes }`. This choice belongs to the integrating application, not its checkout customer.

```ts
const packaging = calculatePackaging(cartItems, {
  boxCatalog: [
    { id: 'medium', name: 'Medium', innerDimensions: { length: 45, width: 35, height: 30 } },
  ],
  dimensionalAllowance: { length: 1, width: 1, height: 1 },
  maxWeightPerBox: 30,
});

const request = buildRateRequestFromPackaging({
  addresses,
  shipmentMode: 'SFN',
  packaging,
  isInsured: '1',
});

const rates = await client.shipments.getRates(request);
const selection = selectCheckoutRate(rates.data, selectedSlug);
// Add selection.shippingCost to the host application's order total.
```

The packer adds the allowance independently to each physical unit's length, width, and height before calculating volume or placement. It uses deterministic first-fit-decreasing placement with rotations enabled by default. It is a practical heuristic, not an optimal-bin-packing guarantee. Every unit is either placed inside a non-overlapping free space within a selected box or reported in `unpackedItems`.

`unitWeight` remains the item `weight` sent to Africanies. The real line weight is `quantity × unitWeight`; each output box's `weight` is its contents plus optional empty-box weight. The effective limit is the smaller of `maxWeightPerBox` and a box definition's `maxGrossWeight`.

After the host confirms payment, it can use the gated convenience call:

```ts
const shipment = await purchaseAfterPayment(client, purchaseRequest, {
  confirmed: true,
  reference: payment.reference,
  confirmedAt: payment.confirmedAt,
});
```

This is a host assertion, not payment-provider verification. Direct `client.shipments.purchase()` remains unchanged.

For purchase documents, `file_is_url` omitted or `0` requests Base64 data and `1` requests URLs. `is_insured: '1'` requests insurance. Always honor the response's per-document `*_is_url` flags.
