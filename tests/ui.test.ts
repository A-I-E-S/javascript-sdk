import { describe, expect, it, vi } from 'vitest';
import type { AfricaniesClient } from '../src/client.js';
import type { ShipmentRateDraft } from '../src/types.js';
import { PurchaseController } from '../src/ui.js';
import { RateSelectionController, preparePurchaseRequest, validateRateRequest } from '../src/ui.js';
import { purchaseRequest, rateRequest } from './fixtures.js';

describe('UI contracts', () => {
  it('enforces mode-specific units', () => {
    const request: ShipmentRateDraft = rateRequest();
    expect(validateRateRequest(request, 'SFN').valid).toBe(true);
    const result = validateRateRequest(request, 'STN');
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('units.mass');
  });

  it('enforces the required rate-address contract', () => {
    const request: ShipmentRateDraft = rateRequest();
    request.addresses.sender.address_landmark = null;
    request.addresses.sender.longitude = null;
    request.addresses.sender.google_address = null;
    const result = validateRateRequest(request, 'SFN');
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'addresses.sender.address_landmark',
      'addresses.sender.longitude',
      'addresses.sender.google_address',
    ]));
  });

  it('prepares purchase payloads with an explicit conversion boundary', () => {
    const result = preparePurchaseRequest(rateRequest(), {
      assignedDate: '2026-08-20', externalReference: 'ORDER-1001',
      shipmentMethodSlug: 'africanies_air_express_sfn',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.request.address).toBeDefined();
      expect(result.request.boxes[0]?.weight).toBe(1.4);
      expect(result.request.shipment_method_slug).toBe('africanies_air_express_sfn');
    }
  });

  it('coalesces duplicate UI purchase submissions', async () => {
    let resolvePurchase!: (value: unknown) => void;
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-1', tracking_number: 'TRK-1', tracking_url: 'https://example.test',
      documents: { waybill_doc: '', insurance_doc: '', invoice_doc: '' },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } };
    const purchase = vi.fn(() => new Promise((resolve) => { resolvePurchase = resolve; }));
    const client = { shipmentMode: 'SFN', shipments: { purchase } } as unknown as AfricaniesClient;
    const controller = new PurchaseController(client, purchaseRequest());
    const first = controller.submit();
    const second = controller.submit();
    expect(purchase).toHaveBeenCalledTimes(1);
    resolvePurchase(response);
    await expect(first).resolves.toEqual(response);
    await expect(second).resolves.toEqual(response);
  });

  it('keeps the newest rate load authoritative and removes stale rates while loading', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = { success: true, status_code: 200, message: 'ok', data: [{
      name: 'Old', slug: 'old', charges: { shipment_cost: 1, insurance_cost: 0, pickup_cost: '0', last_mile_delivery_cost: 0 },
      total_amount: 1, discount_amount: 0, payment_amount: 1, total_item_value: 1,
      others: { min_day: '1', max_day: '2', currency: 'USD' }, mode: 'sfn',
    }] };
    const secondResponse = { ...firstResponse, data: [{ ...firstResponse.data[0]!, name: 'New', slug: 'new' }] };
    const getRates = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const client = { shipmentMode: 'SFN', shipments: { getRates } } as unknown as AfricaniesClient;
    const controller = new RateSelectionController(client, rateRequest());
    const first = controller.load();
    expect(controller.state.rates).toEqual([]);
    const second = controller.load();
    expect(controller.state.rates).toEqual([]);
    resolveSecond(secondResponse);
    await expect(second).resolves.toEqual(secondResponse.data);
    resolveFirst(firstResponse);
    await expect(first).resolves.toEqual(firstResponse.data);
    expect(controller.state.status).toBe('ready');
    expect(controller.state.rates[0]?.slug).toBe('new');
  });
});
