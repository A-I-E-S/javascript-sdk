import { describe, expect, it, vi } from 'vitest';
import { calculatePackaging, buildRateRequestFromPackaging, createCheckoutPurchaseIntent, createCheckoutShippingQuote, purchaseAfterPayment, selectCheckoutRate } from '../src/index.js';
import type { AfricaniesClient, PackagingCartItem, ShipmentRate } from '../src/index.js';
import { rateRequest, purchaseRequest } from './fixtures.js';

const item = (overrides: Partial<PackagingCartItem> = {}): PackagingCartItem => ({
  id: 'dress', name: 'Dress', description: 'Cotton dress', productHsCode: '6204.42',
  country: 'NG', quantity: 2, unitWeight: 4, unitPrice: 100,
  dimensions: { length: 10, width: 10, height: 10 }, ...overrides,
});
const config = { boxCatalog: [{ id: 'medium', name: 'Medium', innerDimensions: { length: 25, width: 25, height: 25 }, emptyWeight: 1 }], dimensionalAllowance: { length: 2, width: 1, height: 3 }, maxWeightPerBox: 30 } as const;

describe('automatic packaging', () => {
  it('applies allowance per axis and preserves unit weight on the wire', () => {
    const result = calculatePackaging([item()], config);
    expect(result.valid).toBe(true);
    expect(result.boxes[0]!.items[0]).toMatchObject({ adjustedUnitDimensions: { length: 12, width: 11, height: 13 }, quantity: 2, totalWeight: 8 });
    expect(result.rateBoxes[0]!.items[0]).toMatchObject({ weight: 4, quantity: 2 });
    expect(result.rateBoxes[0]!.weight).toBe(9);
  });

  it('splits quantities at the configured weight limit without losing units', () => {
    const result = calculatePackaging([item({ quantity: 8 })], { ...config, maxWeightPerBox: 9 });
    expect(result.valid).toBe(true);
    expect(result.boxes).toHaveLength(4);
    expect(result.rateBoxes.reduce((n, box) => n + box.items[0]!.quantity, 0)).toBe(8);
    expect(result.boxes.every((box) => box.totalWeight <= 9)).toBe(true);
  });

  it('reports an item that cannot physically fit', () => {
    const result = calculatePackaging([item({ quantity: 1, dimensions: { length: 100, width: 2, height: 2 } })], config);
    expect(result.valid).toBe(false);
    expect(result.unpackedItems[0]).toMatchObject({ itemId: 'dress', reason: 'ITEM_TOO_LARGE' });
  });

  it('classifies catalog gross-weight and tare failures as overweight', () => {
    const result = calculatePackaging([item({ quantity: 1, unitWeight: 8 })], {
      boxCatalog: [{ id: 'heavy-box', name: 'Heavy box', innerDimensions: { length: 20, width: 20, height: 20 }, emptyWeight: 3, maxGrossWeight: 10 }],
      maxWeightPerBox: 30,
    });
    expect(result.unpackedItems[0]).toMatchObject({ reason: 'ITEM_TOO_HEAVY' });
  });

  it('rejects an empty cart and invalid expanded-unit limits', () => {
    const result = calculatePackaging([], { ...config, maxExpandedUnits: 0 });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['items', 'maxExpandedUnits']));
  });

  it.each(['name', 'description', 'productHsCode', 'country'] as const)('rejects a missing automatic wire field: %s', (field) => {
    const result = calculatePackaging([item({ [field]: '   ' })], config);
    expect(result.valid).toBe(false);
    expect(result.rateBoxes).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ path: `items.0.${field}` }));
    expect(() => buildRateRequestFromPackaging({ addresses: rateRequest().addresses, shipmentMode: 'SFN', packaging: result })).toThrow(/Packaging must be valid/);
  });

  it('keeps manual boxes as an explicit host-selected path', () => {
    const boxes = rateRequest().boxes;
    const result = calculatePackaging([], { mode: 'manual', boxes });
    expect(result.valid).toBe(true);
    expect(result.rateBoxes).toEqual(boxes);
    expect(result.rateBoxes).not.toBe(boxes);
  });

  it('rejects invalid manual unit weights, fractional quantities, and understated box weight', () => {
    const boxes = structuredClone(rateRequest().boxes);
    boxes[0]!.items[0]!.weight = 0;
    boxes[0]!.items[0]!.quantity = 1.5;
    boxes[0]!.weight = 0.5;
    const result = calculatePackaging([], { mode: 'manual', boxes });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['boxes.0.items.0.weight', 'boxes.0.items.0.quantity']));
  });

  it('isolates the packaging result from later catalog mutation', () => {
    const mutableConfig = structuredClone(config);
    const result = calculatePackaging([item()], mutableConfig);
    (mutableConfig.boxCatalog[0]!.innerDimensions as { length: number }).length = 999;
    expect(result.boxes[0]!.dimensions.length).toBe(25);
  });

  it('is deterministic across catalog order and creates in-bounds non-overlapping placements', () => {
    const small = { id: 'small', name: 'Small', innerDimensions: { length: 14, width: 14, height: 14 }, emptyWeight: 0.5 };
    const large = { id: 'large', name: 'Large', innerDimensions: { length: 25, width: 25, height: 25 }, emptyWeight: 1 };
    const first = calculatePackaging([item({ quantity: 3 })], { ...config, boxCatalog: [large, small] });
    const second = calculatePackaging([item({ quantity: 3 })], { ...config, boxCatalog: [small, large] });
    expect(first).toEqual(second);
    for (const box of first.boxes) {
      const placements = box.items.flatMap((assignment) => assignment.placements);
      for (const placement of placements) {
        expect(placement.position.x + placement.dimensions.length).toBeLessThanOrEqual(box.dimensions.length);
        expect(placement.position.y + placement.dimensions.width).toBeLessThanOrEqual(box.dimensions.width);
        expect(placement.position.z + placement.dimensions.height).toBeLessThanOrEqual(box.dimensions.height);
      }
      for (let left = 0; left < placements.length; left += 1) for (let right = left + 1; right < placements.length; right += 1) {
        const a = placements[left]!; const b = placements[right]!;
        const separated = a.position.x + a.dimensions.length <= b.position.x || b.position.x + b.dimensions.length <= a.position.x
          || a.position.y + a.dimensions.width <= b.position.y || b.position.y + b.dimensions.width <= a.position.y
          || a.position.z + a.dimensions.height <= b.position.z || b.position.z + b.dimensions.height <= a.position.z;
        expect(separated).toBe(true);
      }
    }
  });
});

describe('checkout adapters', () => {
  it('infers rate mode from addresses and lets them override a legacy hint', () => {
    const packaging = calculatePackaging([item()], config);
    expect(buildRateRequestFromPackaging({ addresses: rateRequest().addresses, packaging })).toMatchObject({ units: { mass: 'KG', dimension: 'cm' }, last_mile_delivery: true, pickup: false });
    const addresses = structuredClone(rateRequest().addresses); addresses.sender.country='US'; addresses.receiver.country='NG';
    expect(buildRateRequestFromPackaging({ addresses, shipmentMode: 'SFN', packaging })).toMatchObject({ units: { mass: 'LBS', dimension: 'inches' }, last_mile_delivery: false, pickup: true });
  });

  it('builds the existing rate contract and returns selected shipping cost', () => {
    const packaging = calculatePackaging([item()], config);
    const request = buildRateRequestFromPackaging({ addresses: rateRequest().addresses, shipmentMode: 'SFN', packaging, isInsured: '1' });
    expect(request).toMatchObject({ units: { mass: 'KG', dimension: 'cm' }, is_insured: '1', last_mile_delivery: true });
    const rate = { slug: 'carrier-rate', name: 'Carrier', payment_amount: '2400',
      charges: { shipment_cost: 2400, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 },
      total_amount: 2400, discount_amount: 0, total_item_value: 200,
      others: { currency: 'NGN', min_day: '2', max_day: '4' }, mode: 'sfn' } satisfies ShipmentRate;
    const quote = createCheckoutShippingQuote(request, packaging, [rate]);
    expect(selectCheckoutRate(quote, rate.slug)).toMatchObject({ shippingCost: 2400, shipmentMethodSlug: 'carrier-rate' });
  });

  it('requires host payment confirmation before calling purchase', async () => {
    const purchase = vi.fn().mockResolvedValue({ success: true });
    const client = { shipmentMode: 'SFN', shipments: { purchase } } as unknown as AfricaniesClient;
    const packaging = calculatePackaging([item()], config);
    const request = buildRateRequestFromPackaging({ addresses: rateRequest().addresses, shipmentMode: 'SFN', packaging });
    const rate = { slug: 'africanies_air_express_sfn', name: 'Carrier', payment_amount: 2400, charges: { shipment_cost: 2400, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 }, total_amount: 2400, discount_amount: 0, total_item_value: 200, others: { currency: 'NGN', min_day: '2', max_day: '4' }, mode: 'sfn' } satisfies ShipmentRate;
    const selection = selectCheckoutRate(createCheckoutShippingQuote(request, packaging, [rate]), rate.slug);
    const intent = createCheckoutPurchaseIntent(purchaseRequest(), selection);
    await expect(purchaseAfterPayment(client, intent, { confirmed: true, reference: '', confirmedAt: new Date().toISOString(), intentId: intent.id, amount: intent.amount, currency: intent.currency })).rejects.toMatchObject({ category: 'validation' });
    expect(purchase).not.toHaveBeenCalled();
    await expect(purchaseAfterPayment(client, intent, { confirmed: true, reference: 'PAY-OTHER', confirmedAt: new Date().toISOString(), intentId: 'wrong', amount: intent.amount, currency: intent.currency })).rejects.toMatchObject({ category: 'validation' });
    expect(() => { intent.request.external_reference = 'MUTATED'; }).toThrow(TypeError);
    await purchaseAfterPayment(client, intent, { confirmed: true, reference: 'PAY-1', confirmedAt: new Date().toISOString(), intentId: intent.id, amount: intent.amount, currency: intent.currency });
    expect(purchase).toHaveBeenCalledOnce();
  });

  it('rejects stale quotes and selections that do not match the purchase', () => {
    const packaging = calculatePackaging([item()], config);
    const request = buildRateRequestFromPackaging({ addresses: rateRequest().addresses, shipmentMode: 'SFN', packaging });
    const rate = { slug: 'carrier-rate', name: 'Carrier', payment_amount: 2400, charges: { shipment_cost: 2400, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 }, total_amount: 2400, discount_amount: 0, total_item_value: 200, others: { currency: 'NGN', min_day: '2', max_day: '4' }, mode: 'sfn' } satisfies ShipmentRate;
    const quote = createCheckoutShippingQuote(request, packaging, [rate]);
    expect(() => { quote.request.addresses.receiver.city = 'Changed'; }).toThrow(TypeError);
    const selection = selectCheckoutRate(quote, rate.slug);
    const wrongPurchase = purchaseRequest(); wrongPurchase.shipment_method_slug = 'other';
    expect(() => createCheckoutPurchaseIntent(wrongPurchase, selection)).toThrow(/does not match/);
  });
});
