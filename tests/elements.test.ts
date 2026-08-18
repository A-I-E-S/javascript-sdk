// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AfricaniesClient } from '../src/client.js';
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
    element.value = rateRequest();
    let detail: unknown;
    element.addEventListener('africanies-complete', (event) => {
      detail = (event as CustomEvent).detail;
    });
    document.body.append(element);
    element.shadowRoot?.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(detail).toMatchObject({ units: { mass: 'KG', dimension: 'cm' } });
  });

  it('updates locked units when a connected builder receives an STN client', () => {
    const element = document.createElement('africanies-shipment-builder');
    document.body.append(element);
    element.client = fakeClient({ shipmentMode: 'STN' });
    expect(element.value.units).toEqual({ dimension: 'INCHES', mass: 'lbs' });
    expect([...element.shadowRoot!.querySelectorAll<HTMLInputElement>('input[readonly]')].map((input) => input.value))
      .toEqual(['INCHES', 'lbs']);
  });

  it('normalizes host-supplied locked mode and address-role fields', () => {
    const element = document.createElement('africanies-shipment-builder');
    element.setAttribute('shipment-mode', 'STN');
    const value = rateRequest();
    value.units = { dimension: 'cm', mass: 'KG' };
    value.addresses.sender.type = '';
    value.addresses.receiver.type = '';
    element.value = value;
    expect(element.value.units).toEqual({ dimension: 'INCHES', mass: 'lbs' });
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
      { ...structuredClone(value.boxes[0]!), index: '1' },
      { ...structuredClone(value.boxes[0]!), index: '2' },
    ];
    element.value = value;
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="remove-box"][data-box="1"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-box"]')!.click();
    expect(element.value.boxes.map((box) => box.index)).toEqual(['0', '2', '3']);
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
      documents: { waybill_doc: '', insurance_doc: '', invoice_doc: '' },
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
  });

  it('reloads rates and restores rendering after detach and reattach', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: [{
      name: 'AfricanIES Air', slug: 'air-sfn',
      charges: { shipment_cost: 10, insurance_cost: 0, pickup_cost: '0', last_mile_delivery_cost: 0 },
      total_amount: 10, discount_amount: 0, payment_amount: 10, total_item_value: 100,
      others: { min_day: '2', max_day: '4', currency: 'USD' }, mode: 'sfn',
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
});
