// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AfricaniesClient } from '../src/client.js';
import type { ShipmentRateDraft } from '../src/types.js';
import { AfricaniesError } from '../src/errors.js';
import { purchaseRequest, rateRequest } from './fixtures.js';

beforeAll(async () => {
  await import('../src/elements.js');
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
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

  it('uses the four-step SFN workflow without exposing drop-off or coordinate controls', () => {
    const element = document.createElement('africanies-shipment-builder');
    element.value = rateRequest(); document.body.append(element);
    const steps = [...element.shadowRoot!.querySelectorAll('.workflow-step')].map((step) => step.textContent?.trim());
    expect(steps).toHaveLength(4); expect(steps.join(' ')).toContain('Sender'); expect(steps.join(' ')).not.toContain('Drop-off');
    expect(element.shadowRoot!.querySelector('[data-field="latitude"], [data-field="longitude"]')).toBeNull();
    expect(element.value.addresses.sender).toMatchObject({ latitude: 6.5244, longitude: 3.3792 });
    expect(element.value).toMatchObject({ units: { dimension: 'cm', mass: 'KG' }, last_mile_delivery: true, pickup: false });
  });

  it('resets dependent state when country changes and keeps Google address optional', () => {
    const element = document.createElement('africanies-shipment-builder'); element.value = rateRequest(); document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    const country=element.shadowRoot!.querySelector<HTMLSelectElement>('[data-address="receiver"][data-field="country"]')!;
    country.value='NG';country.dispatchEvent(new Event('change',{bubbles:true}));
    expect(element.value.addresses.receiver.state).toBe('');
    const state=element.shadowRoot!.querySelector<HTMLSelectElement>('[data-address="receiver"][data-field="state"]')!;
    expect([...state.options].map((option)=>option.value)).toContain('LA');
    expect(element.shadowRoot!.textContent).toContain('Manual address entry is active');
  });

  it('accepts an injected address provider without exposing its browser key', async () => {
    let selectPlace!: (place: { address: string; city: string; state: string; country: string; zipCode: string; latitude: number; longitude: number }) => void;
    const provider={attach:vi.fn((_input:HTMLInputElement,select:typeof selectPlace)=>{selectPlace=select;})};
    const loader=vi.fn().mockResolvedValue(provider);
    const element=document.createElement('africanies-shipment-builder');element.value=rateRequest();
    element.config={googlePlaces:{apiKey:'runtime-only-secret',loader}};document.body.append(element);await nextTask();
    expect(loader).toHaveBeenCalledWith('runtime-only-secret');expect(element.shadowRoot!.innerHTML).not.toContain('runtime-only-secret');
    expect(element.shadowRoot!.querySelector<HTMLInputElement>('.address-toggle input')!.disabled).toBe(true);
    selectPlace({address:'1 Marina Road',city:'Lagos',state:'LA',country:'NG',zipCode:'100001',latitude:6.45,longitude:3.39});
    expect(element.value.addresses.sender).toMatchObject({address:'1 Marina Road',city:'Lagos',state:'LA',country:'NG',zip_code:'100001',latitude:6.45,longitude:3.39,google_address:'1'});
  });

  it('announces location-provider failure and retains the safe built-in selects', async () => {
    const element=document.createElement('africanies-shipment-builder');element.config={loadCountries:vi.fn().mockRejectedValue(new Error('Location service unavailable'))};document.body.append(element);await nextTask();await nextTask();
    expect(element.shadowRoot!.textContent).toContain('Location service unavailable');
    const country=element.shadowRoot!.querySelector<HTMLSelectElement>('[data-address="sender"][data-field="country"]')!;
    expect([...country.options].map((option)=>option.textContent)).toContain('Nigeria');
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

  it('contains wide summary tables below the mobile workflow actions', () => {
    const styles = readFileSync(join(process.cwd(), 'src/elements/tailwind.css'), 'utf8');
    expect(styles).toContain('details.card{max-width:100%;overflow-x:auto}');
    expect(styles).toContain('form.shell>.actions');
    expect(styles).toContain('.stack>*{min-width:0}');
  });

  it('owns Tailwind as an explicit build-time Shadow DOM stylesheet', () => {
    const styles = readFileSync(join(process.cwd(), 'src/elements/tailwind.css'), 'utf8');
    expect(styles).toContain('@import "tailwindcss" source(none)');
    expect(styles).toContain('@source "./**/*.ts"');
    expect(styles).toContain('--color-africanies-accent');
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

  it('normalizes from populated addresses and preserves address-role fields', () => {
    const element = document.createElement('africanies-shipment-builder');
    element.setAttribute('shipment-mode', 'STN');
    const value = rateRequest();
    value.units = { dimension: 'cm', mass: 'KG' };
    value.addresses.sender.type = '';
    value.addresses.receiver.type = '';
    element.value = value;
    expect(element.value.units).toEqual({ dimension: 'cm', mass: 'KG' });
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
    vi.spyOn(window,'confirm').mockReturnValue(true);
    const element = document.createElement('africanies-shipment-builder');
    const value = rateRequest();
    value.boxes = [
      structuredClone(value.boxes[0]!),
      { ...structuredClone(value.boxes[0]!), index: 1 },
      { ...structuredClone(value.boxes[0]!), index: 2 },
    ];
    element.value = value;
    document.body.append(element);
    for (let step = 0; step < 2; step += 1) {
      element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    }
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="remove-box"][data-box="1"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-box"]')!.click();
    for(const field of element.shadowRoot!.querySelectorAll<HTMLInputElement>('[data-box-field]'))field.value='10',field.dispatchEvent(new Event('input',{bubbles:true}));
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    expect(element.value.boxes.map((box) => box.index)).toEqual([0, 2, '3']);
  });

  it('uses a labelled modal for item editing and restores focus without duplicating the item', async () => {
    const element=document.createElement('africanies-shipment-builder');element.value=rateRequest();document.body.append(element);
    const changes=vi.fn();element.addEventListener('africanies-change',changes);
    for(let step=0;step<2;step+=1)element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    const edit=element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!;edit.focus();edit.click();await nextTask();
    const dialog=element.shadowRoot!.querySelector('dialog')!;expect(dialog.hasAttribute('open')).toBe(true);expect(dialog.getAttribute('aria-labelledby')).toBe('editor-title');
    const name=dialog.querySelector<HTMLInputElement>('[data-item-field="name"]')!;name.value='Temporary';name.dispatchEvent(new Event('input',{bubbles:true}));
    dialog.querySelector<HTMLButtonElement>('[data-action="cancel-editor"]')!.click();await nextTask();
    expect(element.value.boxes[0]!.items).toHaveLength(1);expect(element.value.boxes[0]!.items[0]!.name).toBe('Phone');
    expect(changes).not.toHaveBeenCalled();
    expect(element.shadowRoot!.activeElement).toBe(element.shadowRoot!.querySelector('[data-action="edit-item"]'));
  });

  it('keeps an invalid staged item modal open with an associated error and focused field', async () => {
    const element=document.createElement('africanies-shipment-builder');element.value=rateRequest();document.body.append(element);for(let step=0;step<2;step+=1)element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-item"]')!.click();const name=element.shadowRoot!.querySelector<HTMLInputElement>('[data-item-field="name"]')!;name.value='New item';name.dispatchEvent(new Event('input',{bubbles:true}));element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();await nextTask();
    expect(element.shadowRoot!.querySelector('dialog')?.open).toBe(true);const description=element.shadowRoot!.querySelector<HTMLInputElement>('[data-item-field="description"]')!;expect(description.getAttribute('aria-invalid')).toBe('true');expect(description.getAttribute('aria-describedby')).toBe('editor-error');expect(element.shadowRoot!.activeElement).toBe(description);expect(element.value.boxes[0]!.items).toHaveLength(1);
  });

  it('confirms destructive item removal and preserves stable box ownership', () => {
    const draft=rateRequest();draft.boxes[0]!.items.push({...structuredClone(draft.boxes[0]!.items[0]!),name:'Second'});const element=document.createElement('africanies-shipment-builder');element.value=draft;document.body.append(element);for(let step=0;step<2;step+=1)element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    const confirmation=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="remove-item"][data-item="1"]')!.click();expect(element.value.boxes[0]!.items).toHaveLength(2);element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="remove-item"][data-item="1"]')!.click();expect(element.value.boxes[0]!.items).toHaveLength(1);expect(confirmation).toHaveBeenCalledTimes(2);expect(element.value.boxes[0]!.index).toBe(0);
  });

  it('lets a manual host add repeatable boxes with stable indexes and box-owned item assignments', () => {
    const element=document.createElement('africanies-shipment-builder'); element.value=rateRequest(); document.body.append(element);
    for(let step=0;step<2;step+=1) element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-box"]')!.click();
    for(const field of element.shadowRoot!.querySelectorAll<HTMLInputElement>('[data-box-field]'))field.value='10',field.dispatchEvent(new Event('input',{bubbles:true}));
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-box"]')!.click();
    for(const field of element.shadowRoot!.querySelectorAll<HTMLInputElement>('[data-box-field]'))field.value='10',field.dispatchEvent(new Event('input',{bubbles:true}));
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    expect(element.value.boxes.map((box)=>box.index)).toEqual([0,'1','2']);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="add-item"][data-box="1"]')!.click();
    expect(element.value.boxes.map((box)=>box.items.length)).toEqual([1,1,1]);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="cancel-editor"]')!.click();
    expect(element.value.boxes.map((box)=>box.items.length)).toEqual([1,1,1]);
    expect(element.shadowRoot!.textContent).toContain('Gross weight must include contents and tare');
  });

  it('uses Products API selection to supply the item HS code', async () => {
    const search = vi.fn().mockResolvedValue({ success: true, status_code: 200, message: 'ok', data: [{ id: 1, hs_code: '6204420000', name: 'Cotton dresses', active: true, deleted_at: null, created_at: '2026-01-01', updated_at: null }] });
    const element = document.createElement('africanies-shipment-builder'); element.client = fakeClient({ products: { search } }); element.value = rateRequest(); document.body.append(element);
    for (let step = 0; step < 2; step += 1) element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!.click();
    const query=element.shadowRoot!.querySelector<HTMLInputElement>('[data-product-query]')!; query.value='cotton dress'; query.dispatchEvent(new Event('input',{bubbles:true})); await new Promise((resolve)=>setTimeout(resolve,400));
    expect(search).toHaveBeenCalled();
    element.shadowRoot!.querySelector<HTMLElement>('[data-product-option]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    expect(element.value.boxes[0]!.items[0]).toMatchObject({ product_hs_code: '6204420000', product_hs_code_description: 'Cotton dresses' });
  });

  it('ignores a product search completed after the builder client changes', async () => {
    let resolveSearch!: (value: unknown) => void;
    const search = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveSearch = resolve; }));
    const element = document.createElement('africanies-shipment-builder'); element.client = fakeClient({ products: { search } }); element.value = rateRequest(); document.body.append(element);
    for (let step = 0; step < 2; step += 1) element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!.click();
    const query=element.shadowRoot!.querySelector<HTMLInputElement>('[data-product-query]')!; query.value='head gear'; query.dispatchEvent(new Event('input',{bubbles:true})); await new Promise((resolve)=>setTimeout(resolve,400));
    element.client = fakeClient({ products: { search: vi.fn() } });
    resolveSearch({ success: true, status_code: 200, message: 'ok', data: [{ id: 1, hs_code: 'STALE', name: 'Stale product', active: true, deleted_at: null, created_at: '2026-01-01', updated_at: null }] });
    await nextTask();
    expect(element.shadowRoot!.textContent).not.toContain('Stale product');
    expect(element.value.boxes[0]!.items[0]!.product_hs_code).toBe('8517130000');
  });

  it('debounces product search while the user types and supplies selectable results', async () => {
    const search = vi.fn().mockResolvedValue({ success: true, status_code: 200, message: 'ok', data: [{ id: 1, hs_code: '6506100000', name: 'Head gear', active: true, deleted_at: null, created_at: '2026-01-01', updated_at: null }] });
    const element = document.createElement('africanies-shipment-builder'); element.client = fakeClient({ products: { search } }); element.value = rateRequest(); document.body.append(element);
    for (let step = 0; step < 2; step += 1) element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="next-step"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!.click();
    const query = element.shadowRoot!.querySelector<HTMLInputElement>('[data-product-query]')!;
    query.value = 'he'; query.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 400)); expect(search).not.toHaveBeenCalled();
    query.value = 'head gear'; query.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 400));
    expect(search).toHaveBeenCalledOnce(); expect(element.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!.textContent).toContain('Head gear');
    const refreshed = element.shadowRoot!.querySelector<HTMLInputElement>('[data-product-query]')!;
    refreshed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    expect(element.value.boxes[0]!.items[0]!.product_hs_code).toBe('6506100000');
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="edit-item"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="clear-product"]')!.click();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="save-editor"]')!.click();
    expect(element.shadowRoot!.querySelector('[role="alert"]')!.textContent).toContain('Products API classification');
    expect(element.value.boxes[0]!.items[0]!.product_hs_code).toBe('6506100000');
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
    expect(element.shadowRoot!.textContent).toContain('Shipment purchased successfully');
    expect(element.shadowRoot!.textContent).toContain('Shipment labelUnavailable');
    expect(element.shadowRoot!.textContent).toContain('Insurance');
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-document="invoice"]')!.click();
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
    const insuredRequest = purchaseRequest(); insuredRequest.is_insured = '1'; element.request = insuredRequest;
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await nextTask();
    expect(element.shadowRoot!.textContent).toContain('Shipment labelUnavailable');
    for (const name of ['invoice', 'insurance']) {
      element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-document="${name}"]`)!.click();
      expect(element.shadowRoot!.textContent).toContain('Base64 document returned; consume programmatically');
      expect(element.shadowRoot!.textContent).not.toContain(secretBase64);
      expect(element.shadowRoot!.innerHTML).not.toContain(secretBase64);
    }
  });

  it('labels insurance as not requested and rejects insecure remote result links', async () => {
    const response = { success: true, status_code: 200, message: 'ok', data: {
      reference: 'EX-HTTP', tracking_number: 'TRK-HTTP', tracking_url: 'http://example.test/track',
      documents: { waybill_doc: null, insurance_doc: 'http://example.test/insurance', invoice_doc: 'http://example.test/invoice' },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } };
    const element = document.createElement('africanies-purchase-confirmation');
    element.client = fakeClient({ shipments: { purchase: vi.fn().mockResolvedValue(response) } }); element.request = purchaseRequest(); document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click(); await nextTask();
    expect(element.shadowRoot!.querySelector('a[href^="http://example.test"]')).toBeNull();
    element.shadowRoot!.querySelector<HTMLButtonElement>('[data-document="insurance"]')!.click();
    expect(element.shadowRoot!.textContent).toContain('Not requested for this shipment');
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

  it('keeps populated SFN request authoritative after a legacy STN client is assigned', async () => {
    const firstGetRates = vi.fn().mockResolvedValue({ success: true, status_code: 200, message: 'ok', data: [] });
    const stnGetRates = vi.fn();
    const element = document.createElement('africanies-rate-selection');
    element.client = fakeClient({ shipments: { getRates: firstGetRates } });
    element.request = rateRequest();
    document.body.append(element);
    await nextTask();
    element.client = fakeClient({ shipmentMode: 'STN', shipments: { getRates: stnGetRates } });
    await nextTask();
    expect(stnGetRates).toHaveBeenCalledOnce();
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
