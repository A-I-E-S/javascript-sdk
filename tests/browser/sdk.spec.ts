import { expect, test } from '@playwright/test';
import { purchaseRequest, rateRequest } from '../fixtures.js';

const browserPurchaseResponse = { success: true, status_code: 200, message: 'ok', data: {
  reference: 'EX-BROWSER', tracking_number: 'TRK-BROWSER', tracking_url: null,
  documents: { waybill_doc: null, insurance_doc: null, invoice_doc: null },
  waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
} };

const browserRateResponse = { success: true, status_code: 200, message: 'ok', data: [{
  name: 'AfricanIES Air', slug: 'air-sfn',
  charges: { shipment_cost: 10, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 },
  total_amount: 10, discount_amount: 0, payment_amount: 10, total_item_value: 650,
  others: { min_day: '1', max_day: '2', currency: 'NGN' }, mode: 'sfn',
}] };

test.beforeEach(async ({ page }) => {
  await page.goto('/browser-test.html', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ url: '/dist/africanies-shipping.global.js' });
});

test('packed standalone fixture completes all three elements without network and gates payment', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One browser proves the packaged fixture journey; element behavior retains its full matrix.');
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '4173') return route.continue();
    external.push(url.href); await route.abort('blockedbyclient');
  });
  await page.goto('/examples/elements-standalone/');
  await page.getByRole('button', { name: 'Start' }).click();
  const builder = page.locator('africanies-shipment-builder');
  await expect(builder.getByRole('heading', { name: 'Create shipment' })).toBeVisible();
  expect(await builder.evaluate((element) => element.constructor === customElements.get('africanies-shipment-builder'))).toBe(true);
  for (let step = 0; step < 3; step += 1) await builder.getByRole('button', { name: 'Continue' }).click();
  await builder.getByRole('button', { name: 'Create shipment & review rates' }).click();
  const rates = page.locator('africanies-rate-selection'); await expect(rates.getByText('Fixture Air')).toBeVisible();
  await rates.getByRole('button', { name: 'Select', exact: true }).click(); await rates.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#outcome').selectOption('failed'); await page.locator('#confirm-payment').click();
  await expect(page.locator('#payment-status')).toContainText('No purchase element was mounted'); await expect(page.locator('africanies-purchase-confirmation')).toHaveCount(0);
  await page.locator('#outcome').selectOption('success'); await page.locator('#confirm-payment').click();
  const purchase = page.locator('africanies-purchase-confirmation'); await expect(purchase.getByRole('heading', { name: 'Purchase shipment' })).toBeVisible();
  await purchase.getByRole('button', { name: 'Purchase shipment' }).click(); await expect(purchase.getByText('FIXTURE-TRACKING')).toBeVisible();
  expect(external).toEqual([]);
});

test('global build exposes the client and registers every custom element', async ({ page }) => {
  const result = await page.evaluate(() => {
    const sdk = (globalThis as typeof globalThis & {
      AfricaniesShipping: {
        createAfricaniesClient: (config: unknown) => { environment: string; shipmentMode: string };
      };
    }).AfricaniesShipping;
    const client = sdk.createAfricaniesClient({
      shipmentMode: 'SFN',
      transport: { request: async () => ({ success: true, status_code: 200, message: 'ok', data: [] }) },
    });
    return {
      environment: client.environment,
      shipmentMode: client.shipmentMode,
      builder: Boolean(customElements.get('africanies-shipment-builder')),
      rates: Boolean(customElements.get('africanies-rate-selection')),
      purchase: Boolean(customElements.get('africanies-purchase-confirmation')),
    };
  });

  expect(result).toEqual({
    environment: 'test',
    shipmentMode: 'SFN',
    builder: true,
    rates: true,
    purchase: true,
  });
});

test('test-mode state remains visible in desktop and mobile browsers', async ({ page }) => {
  await page.evaluate(() => { document.body.innerHTML = '<africanies-shipment-builder></africanies-shipment-builder>'; });
  const builder = page.locator('africanies-shipment-builder');

  await expect(builder).toHaveAttribute('data-environment', 'test');
  await expect(builder.locator('.test-mode')).toContainText('Test mode');
  await expect(builder.locator('.shell')).toBeVisible();

  await builder.evaluate((element) => element.setAttribute('environment', 'live'));
  await expect(builder).toHaveAttribute('data-environment', 'live');
  await expect(builder.locator('.test-mode')).toHaveCount(0);
});

test('a client synchronously owns environment and shipment-mode attributes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const element = document.createElement('africanies-shipment-builder');
    (element as HTMLElement & { client: unknown }).client = {
      environment: 'live', shipmentMode: 'STN',
    };
    document.body.append(element);
    element.setAttribute('environment', 'test');
    element.setAttribute('shipment-mode', 'SFN');
    return {
      environment: element.getAttribute('environment'),
      shipmentMode: element.getAttribute('shipment-mode'),
      dataset: element.dataset.environment,
    };
  });
  expect(result).toEqual({ environment: 'live', shipmentMode: 'STN', dataset: 'live' });
});

test('purchase replacement suppresses stale browser completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const address = (type: 'sender' | 'receiver') => ({
      first_name: 'Ada', last_name: 'Lovelace', email: `${type}@example.com`, phone: '1234567890',
      country: type === 'sender' ? 'NG' : 'US', state: 'LA', city: 'Lagos', address: '1 Example Street',
      address_in_detail: '1 Example Street', address_landmark: 'Landmark', zip_code: '100001', type,
      longitude: 3.3, latitude: 6.5, google_address: '0',
    });
    const request = (reference: string) => ({
      address: { sender: address('sender'), receiver: address('receiver') }, assigned_date: '2099-08-20',
      boxes: [{ index: 0, length: 10, width: 10, height: 10, weight: 1, items: [{
        name: 'Phone', description: 'Smartphone', product_hs_code: '8517130000', weight: 1,
        unit_price: 10, quantity: 1, amount: 10, country: 'NG',
      }] }], units: { dimension: 'cm', mass: 'KG' }, currency: 'NGN',
      external_reference: reference, shipment_method_slug: 'air-sfn',
    });
    let resolvePurchase!: (response: unknown) => void;
    const client = { environment: 'test', shipmentMode: 'SFN', shipments: {
      purchase: () => new Promise((resolve) => { resolvePurchase = resolve; }),
    } };
    const element = document.createElement('africanies-purchase-confirmation') as HTMLElement & {
      client: unknown; request: unknown; shadowRoot: ShadowRoot;
    };
    element.client = client;
    element.request = request('OLD');
    let completions = 0;
    element.addEventListener('africanies-complete', () => { completions += 1; });
    document.body.append(element);
    element.shadowRoot.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    element.request = request('NEW');
    resolvePurchase({ success: true, status_code: 200, message: 'ok', data: {
      reference: 'STALE', tracking_number: 'STALE', tracking_url: null,
      documents: { waybill_doc: null, insurance_doc: null, invoice_doc: null },
      waybill_is_url: 1, insurance_is_url: 1, invoice_is_url: 1, mode: 'sfn',
    } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { completions, text: element.shadowRoot.textContent ?? '' };
  });
  expect(result.completions).toBe(0);
  expect(result.text).toContain('NEW');
  expect(result.text).not.toContain('Shipment confirmed');
});

test('purchase disconnect and reconnect discards stale success', async ({ page }) => {
  const result = await page.evaluate(async ({ request, response }) => {
    let resolvePurchase!: (value: unknown) => void;
    const element = document.createElement('africanies-purchase-confirmation') as HTMLElement & { client: unknown; request: unknown; shadowRoot: ShadowRoot };
    element.client = { environment: 'test', shipmentMode: 'SFN', shipments: { purchase: () => new Promise((resolve) => { resolvePurchase = resolve; }) } };
    element.request = request;
    let completions = 0;
    element.addEventListener('africanies-complete', () => { completions += 1; });
    document.body.append(element);
    element.shadowRoot.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    element.remove();
    resolvePurchase(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.append(element);
    return { completions, text: element.shadowRoot.textContent ?? '' };
  }, { request: purchaseRequest(), response: browserPurchaseResponse });
  expect(result.completions).toBe(0);
  expect(result.text).toContain('Purchase shipment');
  expect(result.text).not.toContain('Shipment confirmed');
});

test('purchase client replacement suppresses a stale rejection', async ({ page }) => {
  const result = await page.evaluate(async (request) => {
    let rejectPurchase!: (reason: unknown) => void;
    const element = document.createElement('africanies-purchase-confirmation') as HTMLElement & { client: unknown; request: unknown; shadowRoot: ShadowRoot };
    element.client = { environment: 'test', shipmentMode: 'SFN', shipments: { purchase: () => new Promise((_resolve, reject) => { rejectPurchase = reject; }) } };
    element.request = request;
    let errors = 0;
    element.addEventListener('africanies-error', () => { errors += 1; });
    document.body.append(element);
    element.shadowRoot.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    element.client = { environment: 'live', shipmentMode: 'SFN', shipments: { purchase: async () => { throw new Error('unused'); } } };
    rejectPurchase(new Error('stale browser failure'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { errors, environment: element.getAttribute('environment'), text: element.shadowRoot.textContent ?? '' };
  }, purchaseRequest());
  expect(result.errors).toBe(0);
  expect(result.environment).toBe('live');
  expect(result.text).not.toContain('stale browser failure');
});

test('Stage 1, Stage 2, and Stage 3 emit a composed completion flow', async ({ page }) => {
  const result = await page.evaluate(async ({ rateDraft, purchase, rateResponse, purchaseResponse }) => {
    const completed: string[] = [];
    const capture = (stage: string, element: HTMLElement) => document.body.addEventListener('africanies-complete', (event) => {
      if (event.target === element) completed.push(stage);
    }, { once: true });
    const builder = document.createElement('africanies-shipment-builder') as HTMLElement & { value: unknown; shadowRoot: ShadowRoot };
    builder.value = rateDraft;
    capture('builder', builder);
    document.body.append(builder);
    builder.shadowRoot.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const rates = document.createElement('africanies-rate-selection') as HTMLElement & { client: unknown; request: unknown; shadowRoot: ShadowRoot };
    rates.client = { environment: 'test', shipmentMode: 'SFN', shipments: { getRates: async () => rateResponse } };
    rates.request = rateDraft;
    capture('rates', rates);
    document.body.append(rates);
    await new Promise((resolve) => setTimeout(resolve, 0));
    rates.shadowRoot.querySelector<HTMLButtonElement>('button[data-slug]')!.click();
    rates.shadowRoot.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
    const confirmation = document.createElement('africanies-purchase-confirmation') as HTMLElement & { client: unknown; request: unknown; shadowRoot: ShadowRoot };
    confirmation.client = { environment: 'test', shipmentMode: 'SFN', shipments: { purchase: async () => purchaseResponse } };
    confirmation.request = purchase;
    capture('purchase', confirmation);
    document.body.append(confirmation);
    confirmation.shadowRoot.querySelector<HTMLButtonElement>('[data-action="purchase"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return completed;
  }, { rateDraft: rateRequest(), purchase: purchaseRequest(), rateResponse: browserRateResponse, purchaseResponse: browserPurchaseResponse });
  expect(result).toEqual(['builder', 'rates', 'purchase']);
});
