import { describe, expect, it, vi } from 'vitest';
import type { AfricaniesClient } from '../src/client.js';
import type { ShipmentRate, ShipmentRateDraft } from '../src/types.js';
import { PurchaseController } from '../src/ui.js';
import { RateSelectionController, completeRateRequest, preparePurchaseRequest, validatePurchaseRequest, validateRateRequest } from '../src/ui.js';
import { purchaseRequest, rateRequest } from './fixtures.js';

function shipmentRate(overrides: Partial<ShipmentRate> = {}): ShipmentRate {
  return {
    name: 'AfricanIES Air', slug: 'africanies_air_express_sfn',
    charges: { shipment_cost: 10, insurance_cost: 0, pickup_cost: '0', last_mile_delivery_cost: 0 },
    total_amount: 10, discount_amount: 0, payment_amount: 10, total_item_value: 650,
    others: { min_day: '1', max_day: '2', currency: 'NGN' }, mode: 'sfn',
    ...overrides,
  };
}

describe('UI contracts', () => {
  it('enforces mode-specific units', () => {
    const request: ShipmentRateDraft = rateRequest();
    expect(validateRateRequest(request, 'SFN').valid).toBe(true);
    const result = validateRateRequest(request, 'STN');
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('units.mass');
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'last_mile_delivery', 'pickup',
    ]));
  });

  it('accepts the exact STN unit and pickup contract', () => {
    const request: ShipmentRateDraft = structuredClone(rateRequest());
    request.units = { mass: 'LBS', dimension: 'inches' };
    request.last_mile_delivery = false;
    request.pickup = true;
    request.addresses.receiver.country = 'Nigeria';
    expect(validateRateRequest(request, 'STN')).toEqual({ valid: true, issues: [] });
  });

  it('normalizes draft numeric fields without inventing optional metadata', () => {
    const draft: ShipmentRateDraft = structuredClone(rateRequest());
    draft.boxes[0]!.index = '7';
    draft.boxes[0]!.length = '12.5';
    draft.boxes[0]!.items[0]!.weight = '1.25';
    draft.boxes[0]!.items[0]!.quantity = '2';
    draft.boxes[0]!.weight = '2.5';
    delete draft.boxes[0]!.items[0]!.price;
    delete draft.boxes[0]!.items[0]!.product_hs_code_description;
    expect(validateRateRequest(draft, 'SFN').valid).toBe(true);
    const completed = completeRateRequest(draft);
    expect(completed.boxes[0]).toMatchObject({ index: 7, length: 12.5 });
    expect(completed.boxes[0]!.items[0]).toMatchObject({ weight: 1.25, quantity: 2 });
    expect(completed.boxes[0]!.items[0]).not.toHaveProperty('price');
    expect(completed.boxes[0]!.items[0]).not.toHaveProperty('product_hs_code_description');
  });

  it('enforces the required rate-address contract', () => {
    const request: ShipmentRateDraft = rateRequest();
    request.addresses.sender.address_landmark = null;
    request.addresses.sender.longitude = null;
    request.addresses.sender.google_address = null;
    const result = validateRateRequest(request, 'SFN');
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'addresses.sender.address_landmark',
      'addresses.sender.google_address',
    ]));
  });

  it('prepares purchase payloads with an explicit conversion boundary', () => {
    const result = preparePurchaseRequest(rateRequest(), {
      assignedDate: '2026-08-20', externalReference: 'ORDER-1001',
      rate: shipmentRate(),
      referenceDate: new Date(2026, 7, 18),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.request.address).toBeDefined();
      expect(result.request.boxes[0]?.weight).toBe(1.4);
      expect(result.request.shipment_method_slug).toBe('africanies_air_express_sfn');
      expect(result.request.currency).toBe('NGN');
      expect(result.request.address).toEqual(rateRequest().addresses);
      expect(result.request.boxes[0]!.items[0]).not.toHaveProperty('documents_s3_key');
      expect(result.request.boxes[0]!.items[0]).not.toHaveProperty('photos_s3_key');
    }
  });

  it('rejects a selected rate whose currency does not match the request mode', () => {
    const result = preparePurchaseRequest(rateRequest(), {
      assignedDate: '2026-08-20', externalReference: 'ORDER-1001',
      rate: shipmentRate({ others: { min_day: '1', max_day: '2', currency: 'USD' } }),
      referenceDate: new Date(2026, 7, 18),
    });
    expect(result).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: 'rate.others.currency' })],
    });
  });

  it('derives the STN USD currency and exact selected slug', () => {
    const request = structuredClone(rateRequest());
    request.units = { mass: 'LBS', dimension: 'inches' };
    request.last_mile_delivery = false;
    request.pickup = true;
    request.addresses.receiver.country = 'NG';
    const rate = shipmentRate({
      slug: 'africanies_air_express_stn',
      mode: 'stn',
      others: { min_day: '2', max_day: '4', currency: 'USD' },
    });
    const result = preparePurchaseRequest(request, {
      assignedDate: '2026-08-20', externalReference: 'ORDER-STN-1', rate,
      referenceDate: new Date(2026, 7, 18),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.request).toMatchObject({
        currency: 'USD', shipment_method_slug: 'africanies_air_express_stn',
      });
    }
  });

  it('enforces SFN sender and STN receiver geography before rates and purchase', () => {
    const rate = rateRequest();
    rate.addresses.sender.country = 'US';
    expect(validateRateRequest(rate, 'SFN').issues).toContainEqual(expect.objectContaining({ path: 'addresses.sender.country' }));
    const purchase = purchaseRequest();
    purchase.address.receiver.country = 'US';
    expect(validatePurchaseRequest(purchase, 'STN', new Date(2026, 7, 18)).issues).toContainEqual(expect.objectContaining({ path: 'address.receiver.country' }));
  });

  it('emits numeric file flags and supplied item file references only', () => {
    const request = rateRequest();
    request.is_insured = '1';
    const result = preparePurchaseRequest(request, {
      assignedDate: '2026-08-20', externalReference: 'ORDER-1001', rate: shipmentRate(),
      fileIsUrl: 1,
      itemFiles: { '0:0': { documents_s3_key: ['documents/example.pdf'] } },
      referenceDate: new Date(2026, 7, 18),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.request.file_is_url).toBe(1);
      expect(result.request.is_insured).toBe('1');
      expect(result.request.boxes[0]!.items[0]!.documents_s3_key).toEqual(['documents/example.pdf']);
      expect(result.request.boxes[0]!.items[0]).not.toHaveProperty('photos_s3_key');
    }
  });

  it('requires a real assigned date strictly after the injectable reference day', () => {
    const referenceDate = new Date(2026, 7, 18, 23, 59);
    const request = purchaseRequest();
    for (const assignedDate of ['2026-02-30', '2026-08-18', '2026-08-17']) {
      request.assigned_date = assignedDate;
      expect(validatePurchaseRequest(request, 'SFN', referenceDate).issues)
        .toEqual(expect.arrayContaining([expect.objectContaining({ path: 'assigned_date' })]));
    }
    request.assigned_date = '2026-08-19';
    expect(validatePurchaseRequest(request, 'SFN', referenceDate)).toEqual({ valid: true, issues: [] });
  });

  it('rejects string purchase file flags at runtime', () => {
    const request = purchaseRequest();
    (request as unknown as { file_is_url: unknown }).file_is_url = '1';
    const result = validatePurchaseRequest(request, 'SFN', new Date(2026, 7, 18));
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'file_is_url' }),
    ]));
  });

  it('rejects invalid purchase insurance flags before transport', async () => {
    const request = purchaseRequest();
    (request as unknown as { is_insured: unknown }).is_insured = 1;
    const result = validatePurchaseRequest(request, 'SFN', new Date(2026, 7, 18));
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'is_insured' }),
    ]));
    const purchase = vi.fn();
    const client = { shipmentMode: 'SFN', shipments: { purchase } } as unknown as AfricaniesClient;
    await expect(new PurchaseController(client, request).submit()).rejects.toMatchObject({
      category: 'validation',
      data: expect.arrayContaining([expect.objectContaining({ path: 'is_insured' })]),
    });
    expect(purchase).not.toHaveBeenCalled();
  });

  it('rejects invalid dates and string file flags during purchase preparation', () => {
    const referenceDate = new Date(2026, 7, 18);
    for (const assignedDate of ['2026-02-30', '2026-08-18', '2026-08-17']) {
      const result = preparePurchaseRequest(rateRequest(), {
        assignedDate,
        externalReference: 'ORDER-INVALID',
        rate: shipmentRate(),
        referenceDate,
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues.map((issue) => issue.path)).toContain('assigned_date');
    }
    const stringFlagOptions = {
      assignedDate: '2026-08-19',
      externalReference: 'ORDER-INVALID-FLAG',
      rate: shipmentRate(),
      fileIsUrl: '1',
      referenceDate,
    } as unknown as Parameters<typeof preparePurchaseRequest>[1];
    const result = preparePurchaseRequest(rateRequest(), stringFlagOptions);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map((issue) => issue.path)).toContain('file_is_url');
  });

  it('validates nullable and finite numeric purchase coordinates', () => {
    const referenceDate = new Date(2026, 7, 18);
    const valid = purchaseRequest();
    valid.address.sender.longitude = null;
    valid.address.sender.latitude = '6.5244';
    valid.address.receiver.longitude = '-71.0598';
    expect(validatePurchaseRequest(valid, 'SFN', referenceDate)).toEqual({ valid: true, issues: [] });

    const invalid = purchaseRequest();
    (invalid.address.sender as unknown as { longitude: unknown }).longitude = 'not-a-number';
    (invalid.address.sender as unknown as { latitude: unknown }).latitude = Number.POSITIVE_INFINITY;
    (invalid.address.receiver as unknown as { longitude: unknown }).longitude = '0x10';
    (invalid.address.receiver as unknown as { latitude: unknown }).latitude = '91';
    const result = validatePurchaseRequest(invalid, 'SFN', referenceDate);
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'address.sender.longitude',
      'address.sender.latitude',
      'address.receiver.longitude',
      'address.receiver.latitude',
    ]));
  });

  it('coalesces duplicate UI purchase submissions', async () => {
    let resolvePurchase!: (value: unknown) => void;
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-1', tracking_number: 'TRK-1', tracking_url: 'https://example.test',
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: 'https://example.test/invoice' },
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
      ...shipmentRate({ name: 'Old', slug: 'old' }),
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

  it('rejects a rate request that conflicts with the client mode before transport', async () => {
    const getRates = vi.fn();
    const client = { shipmentMode: 'STN', shipments: { getRates } } as unknown as AfricaniesClient;
    const controller = new RateSelectionController(client, rateRequest());
    await expect(controller.load()).rejects.toMatchObject({
      category: 'validation',
      data: expect.arrayContaining([expect.objectContaining({ path: 'units.mass' })]),
    });
    expect(getRates).not.toHaveBeenCalled();
    expect(controller.state).toMatchObject({ status: 'error', rates: [], selectedSlug: null });
    expect(controller.state.error).toMatchObject({ category: 'validation' });
  });

  it('does not let an old cancelled purchase clear a newer in-flight submission', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-1', tracking_number: 'TRK-1', tracking_url: null,
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: null },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } };
    const purchase = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const client = { shipmentMode: 'SFN', shipments: { purchase } } as unknown as AfricaniesClient;
    const controller = new PurchaseController(client, purchaseRequest());
    const first = controller.submit();
    controller.cancel();
    const second = controller.submit();
    resolveFirst(response);
    await expect(first).resolves.toEqual(response);
    expect(controller.submit()).toBe(second);
    expect(purchase).toHaveBeenCalledTimes(2);
    resolveSecond(response);
    await expect(second).resolves.toEqual(response);
  });

  it('accepts finite numeric-string rate amounts from the API', async () => {
    const stringAmountRate = { ...shipmentRate(), payment_amount: '128766.1429' };
    const getRates = vi.fn().mockResolvedValue({
      success: true, status_code: 200, message: 'ok', data: [stringAmountRate],
    });
    const client = { shipmentMode: 'SFN', shipments: { getRates } } as unknown as AfricaniesClient;
    const controller = new RateSelectionController(client, rateRequest());
    await expect(controller.load()).resolves.toEqual([stringAmountRate]);
    expect(controller.state.status).toBe('ready');
  });

  it('rejects non-array or malformed rate data as a diagnosable API error', async () => {
    const getRates = vi.fn().mockResolvedValue({
      success: true, status_code: 200, message: 'ok', data: { rates: [] },
    });
    const client = { shipmentMode: 'SFN', shipments: { getRates } } as unknown as AfricaniesClient;
    const controller = new RateSelectionController(client, rateRequest());
    await expect(controller.load()).rejects.toMatchObject({ category: 'api' });
    expect(controller.state).toMatchObject({ status: 'error', rates: [] });
  });

  it('does not relabel state-listener failures as network errors', async () => {
    const getRates = vi.fn().mockResolvedValue({
      success: true, status_code: 200, message: 'ok', data: [shipmentRate()],
    });
    const client = { shipmentMode: 'SFN', shipments: { getRates } } as unknown as AfricaniesClient;
    const controller = new RateSelectionController(client, rateRequest());
    controller.subscribe((state) => {
      if (state.status === 'ready') throw new Error('render listener failed');
    });
    await expect(controller.load()).rejects.toThrow('render listener failed');
    expect(controller.state.status).toBe('ready');
    expect(controller.state.error).toBeNull();
  });
});
