import { describe, expect, it, vi } from 'vitest';
import { calculatePackaging, buildRateRequestFromPackaging, purchaseAfterPayment, selectCheckoutRate } from '../src/index.js';
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

  it('keeps manual boxes as an explicit host-selected path', () => {
    const boxes = rateRequest().boxes;
    const result = calculatePackaging([], { mode: 'manual', boxes });
    expect(result.valid).toBe(true);
    expect(result.rateBoxes).toEqual(boxes);
    expect(result.rateBoxes).not.toBe(boxes);
  });
});

describe('checkout adapters', () => {
  it('builds the existing rate contract and returns selected shipping cost', () => {
    const packaging = calculatePackaging([item()], config);
    const request = buildRateRequestFromPackaging({ addresses: rateRequest().addresses, shipmentMode: 'SFN', packaging, isInsured: '1' });
    expect(request).toMatchObject({ units: { mass: 'KG', dimension: 'cm' }, is_insured: '1', last_mile_delivery: true });
    const rate = { slug: 'carrier-rate', name: 'Carrier', payment_amount: '2400',
      charges: { shipment_cost: 2400, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 },
      total_amount: 2400, discount_amount: 0, total_item_value: 200,
      others: { currency: 'NGN', min_day: '2', max_day: '4' }, mode: 'sfn' } satisfies ShipmentRate;
    expect(selectCheckoutRate([rate], rate.slug)).toMatchObject({ shippingCost: 2400, shipmentMethodSlug: 'carrier-rate' });
  });

  it('requires host payment confirmation before calling purchase', async () => {
    const purchase = vi.fn().mockResolvedValue({ success: true });
    const client = { shipments: { purchase } } as unknown as AfricaniesClient;
    await expect(purchaseAfterPayment(client, purchaseRequest(), { confirmed: true, reference: '', confirmedAt: new Date().toISOString() })).rejects.toMatchObject({ category: 'validation' });
    expect(purchase).not.toHaveBeenCalled();
    await purchaseAfterPayment(client, purchaseRequest(), { confirmed: true, reference: 'PAY-1', confirmedAt: new Date().toISOString() });
    expect(purchase).toHaveBeenCalledOnce();
  });
});
