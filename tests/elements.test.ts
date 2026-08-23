// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AfricaniesClient } from '../src/client.js';
import type { ShipmentRateDraft } from '../src/types.js';
import { AfricaniesError } from '../src/errors.js';
import { purchaseRequest, rateRequest } from './fixtures.js';

beforeAll(async () => {
  await import('../src/elements.js');
});

afterEach(() => {
  document.body.replaceChildren();
});

function fakeClient(overrides: Record<string, unknown> = {}): AfricaniesClient {
  return {
    environment: 'test',
    shipmentMode: 'SFN',
    shipments: { getRates: vi.fn(), purchase: vi.fn(), track: vi.fn() },
    ...overrides,
  } as unknown as AfricaniesClient;
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AfricanIES custom elements', () => {
  it('registers all independently mountable stages', () => {
    expect(customElements.get('africanies-shipment-builder')).toBeDefined();
    expect(customElements.get('africanies-rate-selection')).toBeDefined();
    expect(customElements.get('africanies-purchase-confirmation')).toBeDefined();
  });

  it('shows a persistent test-mode marker and exposes environment state', () => {
    const element = document.createElement('africanies-shipment-builder');
    document.body.append(element);
    expect(element.dataset.environment).toBe('test');
    expect(element.shadowRoot?.textContent).toContain('Test mode');
    element.setAttribute('environment', 'live');
    expect(element.dataset.environment).toBe('live');
    expect(element.shadowRoot?.textContent).not.toContain('Test mode');
  });

  it('emits a complete rate request from Stage 1', () => {
    const element = document.createElement('africanies-shipment-builder');
    const draft: ShipmentRateDraft = structuredClone(rateRequest());
    draft.boxes[0]!.index = '0';
    draft.boxes[0]!.length = '10';
    draft.boxes[0]!.items[0]!.weight = '1.4';
    draft.boxes[0]!.items[0]!.quantity = '1';
    delete draft.boxes[0]!.items[0]!.price;
    delete draft.boxes[0]!.items[0]!.product_hs_code_description;
    element.value = draft;
    let detail: unknown;
    element.addEventListener('africanies-complete', (event) => {
      detail = (event as CustomEvent).detail;
    });
    document.body.append(element);
    element.shadowRoot?.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(detail).toMatchObject({ units: { mass: 'KG', dimension: 'cm' } });
    expect(detail).toMatchObject({ pickup: false, last_mile_delivery: true });
    expect((detail as ReturnType<typeof rateRequest>).boxes[0]).toMatchObject({ index: 0, length: 10 });
    expect((detail as ReturnType<typeof rateRequest>).boxes[0]!.items[0]).toMatchObject({ weight: 1.4, quantity: 1 });
    expect((detail as ReturnType<typeof rateRequest>).boxes[0]!.items[0]).not.toHaveProperty('price');
  });

  it('updates locked units when a connected builder receives an STN client', () => {
    const element = document.createElement('africanies-shipment-builder');
    document.body.append(element);
    element.client = fakeClient({ shipmentMode: 'STN' });
    expect(element.value.units).toEqual({ dimension: 'inches', mass: 'LBS' });
    expect(element.value).toMatchObject({ last_mile_delivery: false, pickup: true });
    expect([...element.shadowRoot!.querySelectorAll<HTMLInputElement>('input[readonly]')].map((input) => input.value))
      .toEqual(['inches', 'LBS', 'Disabled', 'Enabled']);
  });

  it('keeps client environment and mode authoritative over host attributes', () => {
    const element = document.createElement('africanies-shipment-builder');
    element.client = fakeClient({ environment: 'live', shipmentMode: 'STN' });
    document.body.append(element);
    element.setAttribute('environment', 'test');
    element.setAttribute('shipment-mode', 'SFN');
    expect(element.environment).toBe('live');
    expect(element.shipmentMode).toBe('STN');
    expect(element.getAttribute('environment')).toBe('live');
    expect(element.getAttribute('shipment-mode')).toBe('STN');
    expect(element.dataset.environment).toBe('live');
    expect(element.value.units).toEqual({ dimension: 'inches', mass: 'LBS' });
    expect(element.shadowRoot?.textContent).not.toContain('Test mode');
  });

  it('normalizes host-supplied locked mode and address-role fields', () => {
    const element = document.createElement('africanies-shipment-builder');
    element.setAttribute('shipment-mode', 'STN');
    const value = rateRequest();
    value.units = { dimension: 'cm', mass: 'KG' };
    value.addresses.sender.type = '';
    value.addresses.receiver.type = '';
    element.value = value;
    expect(element.value.units).toEqual({ dimension: 'inches', mass: 'LBS' });
    expect(element.value.addresses.sender.type).toBe('sender');
    expect(element.value.addresses.receiver.type).toBe('receiver');
  });

  it('associates builder issues with fields and focuses the first invalid control', () => {
    const element = document.createElement('africanies-shipment-builder');
    document.body.append(element);
    element.shadowRoot!.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    const firstName = element.shadowRoot!.querySelector<HTMLInputElement>(
      '[data-path="addresses.sender.first_name"]',
    )!;
    expect(firstName.getAttribute('aria-invalid')).toBe('true');
    expect(firstName.getAttribute('aria-describedby')).toBeTruthy();
    expect(element.shadowRoot!.activeElement).toBe(firstName);
  });

  it('does not reuse a box index after a middle box is removed', () => {
    const element = document.createElement('africanies-shipment-builder');
    const value = rateRequest();
    value.boxes = [
      structuredClone(value.boxes[0]!),
      { ...structuredClone(value.boxes[0]!), index: 1 },
      { ...structuredClone(value.boxes[0]!), index: 2 },
    ];
    element.value = value;
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="remove-box"][data-box="1"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-box"]')!.click();
    expect(element.value.boxes.map((box) => box.index)).toEqual([0, 2, '3']);
  });

  it('renders purchase validation issues instead of silently rejecting', async () => {
    const purchase = vi.fn();
    const request = purchaseRequest();
    request.external_reference = '';
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = request;
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('external_reference: This field is required.');
    expect(purchase).not.toHaveBeenCalled();
  });

  it('surfaces duplicate API status and payload details and emits the error', async () => {
    const duplicate = new AfricaniesError('External reference already paid.', {
      category: 'api', status: 409, apiStatusCode: 409, data: { external_reference: 'ORDER-1001' },
    });
    const purchase = vi.fn().mockRejectedValue(duplicate);
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = purchaseRequest();
    let emitted: unknown;
    element.addEventListener('africanies-error', (event) => { emitted = (event as CustomEvent).detail; });
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('HTTP status: 409');
    expect(element.shadowRoot!.textContent).toContain('ORDER-1001');
    expect(emitted).toBe(duplicate);
  });

  it('restores purchase rendering after detach and reattach', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-1', tracking_number: 'TRK-1', tracking_url: 'https://example.test',
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: 'https://example.test/invoice' },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } };
    const purchase = vi.fn().mockResolvedValue(response);
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = purchaseRequest();
    document.body.append(element);
    element.remove();
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('Shipment confirmed');
    expect(element.shadowRoot!.textContent).toContain('Waybill documentUnavailable');
    expect(element.shadowRoot!.textContent).toContain('Insurance documentUnavailable');
    expect(element.shadowRoot!.querySelector('a[href="https://example.test/invoice"]')).not.toBeNull();
  });

  it('drops an in-flight purchase and its events when detached', async () => {
    let resolvePurchase!: (value: unknown) => void;
    const purchase = vi.fn().mockImplementation(() => new Promise((resolve) => { resolvePurchase = resolve; }));
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = purchaseRequest();
    const complete = vi.fn();
    element.addEventListener('africanies-complete', complete);
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    element.remove();
    resolvePurchase({ success: true, status_code: 200, message: 'ok', data: {
      reference: 'STALE', tracking_number: 'STALE', tracking_url: null,
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: null },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } });
    await nextTask();
    expect(complete).not.toHaveBeenCalled();
    document.body.append(element);
    expect(element.shadowRoot!.textContent).toContain('Purchase shipment');
    expect(element.shadowRoot!.textContent).not.toContain('Shipment confirmed');
  });

  it('ignores completion from a purchase superseded by a new request', async () => {
    let resolvePurchase!: (value: unknown) => void;
    const purchase = vi.fn().mockImplementation(() => new Promise((resolve) => { resolvePurchase = resolve; }));
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = purchaseRequest();
    const complete = vi.fn();
    element.addEventListener('africanies-complete', complete);
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    const replacement = purchaseRequest();
    replacement.external_reference = 'REPLACEMENT';
    element.request = replacement;
    resolvePurchase({ success: true, status_code: 200, message: 'ok', data: {
      reference: 'STALE', tracking_number: 'STALE', tracking_url: null,
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: null },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } });
    await nextTask();
    expect(complete).not.toHaveBeenCalled();
    expect(element.shadowRoot!.textContent).toContain('REPLACEMENT');
    expect(element.shadowRoot!.textContent).not.toContain('Shipment confirmed');
  });

  it('ignores a stale rejection after the client is replaced', async () => {
    let rejectPurchase!: (reason: unknown) => void;
    const stalePurchase = vi.fn().mockImplementation(() => new Promise((_resolve, reject) => { rejectPurchase = reject; }));
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase: stalePurchase } });
    element.request = purchaseRequest();
    const emittedError = vi.fn();
    element.addEventListener('africanies-error', emittedError);
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    element.client = fakeClient({ environment: 'live', shipmentMode: 'SFN', shipments: { purchase: vi.fn() } });
    rejectPurchase(new AfricaniesError('Stale failure.', { category: 'api', status: 424 }));
    await nextTask();
    expect(emittedError).not.toHaveBeenCalled();
    expect(element.getAttribute('environment')).toBe('live');
    expect(element.shadowRoot!.textContent).not.toContain('Stale failure.');
    expect(element.shadowRoot!.textContent).toContain('Purchase shipment');
  });

  it('labels Base64 documents without embedding or logging their contents', async () => {
    const secretBase64 = 'JVBERi0xLjQtc2Vuc2l0aXZlLWRvY3VtZW50';
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-BASE64', tracking_number: 'TRK-BASE64', tracking_url: 'https://example.test',
      documents: {
        waybill_doc: null,
        insurance_doc: secretBase64,
        invoice_doc: secretBase64,
      },
      waybill_is_url: 0, insurance_is_url: 0, invoice_is_url: 0, mode: 'sfn',
    } };
    const purchase = vi.fn().mockResolvedValue(response);
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase } });
    element.request = purchaseRequest();
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await nextTask();
    const text = element.shadowRoot!.textContent ?? '';
    expect(text).toContain('Waybill documentUnavailable');
    expect(text.match(/Base64 document returned; consume programmatically/g)).toHaveLength(2);
    expect(text).not.toContain(secretBase64);
    expect(element.shadowRoot!.innerHTML).not.toContain(secretBase64);
  });

  it('reloads rates and restores rendering after detach and reattach', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: [{
      name: 'AfricanIES Air', slug: 'air-sfn',
      charges: { shipment_cost: 10, insurance_cost: 0, pickup_cost: '0', last_mile_delivery_cost: 0 },
      total_amount: 10, discount_amount: 0, payment_amount: 10, total_item_value: 100,
      others: { min_day: '2', max_day: '4', currency: 'NGN' }, mode: 'sfn',
    }] };
    const getRates = vi.fn().mockResolvedValue(response);
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates } });
    element.request = rateRequest();
    document.body.append(element);
    await nextTask();
    element.remove();
    document.body.append(element);
    await nextTask();
    expect(getRates).toHaveBeenCalledTimes(2);
    expect(element.shadowRoot!.textContent).toContain('AfricanIES Air');
  });

  it('makes exactly one request for a manual rate refresh', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: [] };
    const getRates = vi.fn().mockResolvedValue(response);
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates } });
    element.request = rateRequest();
    document.body.append(element);
    await nextTask();
    expect(getRates).toHaveBeenCalledTimes(1);
    await element.load();
    expect(getRates).toHaveBeenCalledTimes(2);
  });

  it('does not send an SFN request after the rate element client is replaced with STN', async () => {
    const firstGetRates = vi.fn().mockResolvedValue({ success: true, status_code: 200, message: 'ok', data: [] });
    const stnGetRates = vi.fn();
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates: firstGetRates } });
    element.request = rateRequest();
    document.body.append(element);
    await nextTask();
    element.client = fakeClient({ shipmentMode: 'STN', shipments: { getRates: stnGetRates } });
    await nextTask();
    expect(stnGetRates).not.toHaveBeenCalled();
    expect(element.shadowRoot!.textContent).toContain('invalid fields');
  });

  it('renders numeric-string rate amounts without throwing', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: [{
      name: 'AfricanIES Air', slug: 'air-sfn',
      charges: { shipment_cost: 10, insurance_cost: 0, pickup_cost: '0', last_mile_delivery_cost: 0 },
      total_amount: 10, discount_amount: 0, payment_amount: '128766.1429', total_item_value: 100,
      others: { min_day: '2', max_day: '4', currency: 'NGN' }, mode: 'sfn',
    }] };
    const getRates = vi.fn().mockResolvedValue(response);
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates } });
    element.request = rateRequest();
    document.body.append(element);
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('NGN 128766.14');
    expect(element.shadowRoot!.textContent).not.toContain('Unable to load shipment rates');
  });

  it('emits invalid rate payload errors with API diagnostics', async () => {
    const getRates = vi.fn().mockResolvedValue({
      success: true, status_code: 200, message: 'ok', data: { rates: [] },
    });
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates } });
    element.request = rateRequest();
    let emitted: unknown;
    element.addEventListener('africanies-error', (event) => { emitted = (event as CustomEvent).detail; });
    document.body.append(element);
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('invalid shipment rate data');
    expect(emitted).toMatchObject({ category: 'api' });
  });
});
