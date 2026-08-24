import { expect, test, type Page, type Request } from '@playwright/test';

const apiPattern = 'https://api-sandbox.africaniestest.com/api/v1/**';
const credential = 'dGVzdDpjcmVkZW50aWFs';
const product = { id: 1, hs_code: '6506100000', name: 'Protective head gear', active: true, deleted_at: null, created_at: '2026-01-01', updated_at: null };
const rate = { name: 'Africanies Air Express', slug: 'air-sfn', charges: { shipment_cost: 12000, insurance_cost: 0, pickup_cost: 0, last_mile_delivery_cost: 0 }, total_amount: 12000, discount_amount: 0, payment_amount: 12000, total_item_value: 18500, others: { min_day: '3', max_day: '5', currency: 'NGN' }, mode: 'sfn' };
const envelope = (data: unknown, success = true, message = 'ok') => ({ success, status_code: success ? 200 : 401, message, data });

type ApiFixture = { purchase?: Record<string, unknown>; purchaseCount: number; requests: Request[] };

function purchaseResult(insured: boolean, base64 = false): Record<string, unknown> {
  const pdf = 'JVBERi0xLjQKJcTl8uXrCg==';
  return {
    reference: 'EX-UAT-1', tracking_number: 'TRACK-UAT-1', tracking_url: 'https://tracking.example.test/TRACK-UAT-1',
    documents: { waybill_doc: base64 ? pdf : 'https://docs.example.test/waybill.pdf', invoice_doc: base64 ? pdf : 'https://docs.example.test/invoice.pdf', insurance_doc: insured ? (base64 ? pdf : 'https://docs.example.test/insurance.pdf') : null },
    waybill_is_url: base64 ? 0 : 1, invoice_is_url: base64 ? 0 : 1, insurance_is_url: base64 ? 0 : 1, mode: 'sfn',
  };
}

async function mockApi(page: Page, options: { authFailure?: boolean; products?: unknown[]; purchaseFailure?: boolean; purchaseApiFailure?: boolean; purchaseValidationFailure?: boolean; purchaseData?: Record<string, unknown> } = {}): Promise<ApiFixture> {
  const fixture: ApiFixture = { purchaseCount: 0, requests: [] };
  await page.route(apiPattern, async (route) => {
    const request = route.request(); fixture.requests.push(request);
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/shipment/carriers') && options.authFailure) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(envelope({}, false, 'Invalid credential')) }); return;
    }
    let data: unknown = [];
    if (path.includes('/product/search/')) data = options.products ?? [product];
    if (path.endsWith('/shipment/rates')) data = [rate];
    if (path.endsWith('/shipment/purchase')) {
      fixture.purchaseCount += 1; fixture.purchase = request.postDataJSON();
      if (options.purchaseFailure) { await route.abort('timedout'); return; }
      if (options.purchaseApiFailure) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, status_code: 409, message: 'External reference already paid.', data: { external_reference: fixture.purchase?.external_reference } }) }); return;
      }
      if (options.purchaseValidationFailure) {
        await route.fulfill({ status: 424, contentType: 'application/json', body: JSON.stringify({ success: false, status_code: 424, message: 'Unit weight validation failed.', data: { boxes: ['Review quantity and unit weight.'] } }) }); return;
      }
      data = options.purchaseData ?? purchaseResult(false);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(data)) });
  });
  return fixture;
}

async function login(page: Page): Promise<void> {
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
  await page.locator('#encoded-key').fill(credential);
  await page.getByRole('button', { name: 'Validate and enter store' }).click();
  await expect(page.locator('#store-view')).toBeVisible();
  await expect(page.locator('#encoded-key')).toHaveValue('');
}

async function manualLogin(page: Page): Promise<void> {
  await page.goto('http://127.0.0.1:4174/manual.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#manual-key').fill(credential);
  await page.getByRole('button', { name: 'Validate and open lab' }).click();
  await expect(page.locator('#manual-app')).toBeVisible();
  await expect(page.locator('#manual-login')).toBeHidden();
  await expect(page.locator('#manual-key')).toHaveValue('');
}

async function reachManualPayment(page: Page): Promise<void> {
  await manualLogin(page);
  const builder = page.locator('africanies-shipment-builder');
  for (let step = 0; step < 3; step += 1) await builder.getByRole('button', { name: 'Continue' }).click();
  await builder.getByLabel('Item name').fill('Safety helmet');
  await builder.getByLabel('Description').fill('Protective head gear');
  await builder.locator('[data-product-query]').fill('head gear');
  await expect(builder.getByLabel('Select product classification')).toBeVisible();
  await builder.getByLabel('Select product classification').selectOption(product.hs_code);
  await builder.getByRole('button', { name: 'Continue' }).click();
  await builder.getByRole('button', { name: /Create shipment/ }).click();
  const rates = page.locator('africanies-rate-selection');
  await expect(rates.getByText(rate.name)).toBeVisible();
  await rates.locator(`button[data-slug="${rate.slug}"]`).click();
  await rates.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.manual-payment')).toBeVisible();
}

async function classifyAndAdd(page: Page, quantity = '1'): Promise<void> {
  await page.locator('[data-product="headgear"].quantity').fill(quantity);
  await page.locator('button[data-product="headgear"].search-product').click();
  await page.locator('[data-product-results="headgear"]').selectOption(product.hs_code);
  await expect(page.locator('#checkout-button')).toBeEnabled();
}

async function selectRate(page: Page): Promise<void> {
  const card = page.locator('.rate-card').filter({ hasText: rate.name });
  await card.click();
  await expect(card.locator('input[name="rate"]')).toBeChecked();
  await expect(page.locator('#rate-button')).toBeEnabled();
}

async function reachPayment(page: Page, insured = false): Promise<void> {
  await classifyAndAdd(page); await page.locator('#checkout-button').click();
  if (insured) await page.locator('#insured').check();
  await page.getByRole('button', { name: 'Calculate packaging and rates' }).click();
  await expect(page.getByText(rate.name)).toBeVisible();
  await selectRate(page); await page.locator('#rate-button').click();
  await expect(page.locator('#payment-section')).toBeVisible();
}

async function reachPaymentWithQuantity(page: Page, quantity: string, insured = false): Promise<void> {
  await classifyAndAdd(page, quantity); await page.locator('#checkout-button').click();
  if (insured) await page.locator('#insured').check();
  await page.getByRole('button', { name: 'Calculate packaging and rates' }).click();
  await selectRate(page); await page.locator('#rate-button').click();
}

test('uninsured SFN checkout preserves unit weight, selected rate, payment, tracking and URL documents', async ({ page }) => {
  const fixture = await mockApi(page); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.locator('#result-section')).toBeVisible(); await expect(page.getByText('TRACK-UAT-1')).toBeVisible();
  await expect(page.locator('.payment-record')).toContainText('PAYDEMO FULL ORDER + DELIVERY PAYMENT');
  await expect(page.locator('.payment-record')).toContainText('30,500');
  await expect(page.locator('.payment-record')).toContainText('Confirmed');
  await expect(page.getByRole('link', { name: /Track shipment/ })).toHaveAttribute('href', /^https:/);
  await expect(page.locator('#shipment-result').getByText('Not requested')).toBeVisible(); expect(fixture.purchaseCount).toBe(1);
  expect(fixture.purchase).toMatchObject({ file_is_url: 1, is_insured: '0', shipment_method_slug: rate.slug, currency: 'NGN' });
  const address = fixture.purchase?.address as { sender: { country: string }; receiver: { country: string } };
  expect(address.sender.country).toBe('NG'); expect(address.receiver.country).toBe('US');
  const boxes = fixture.purchase?.boxes as Array<{ weight: number; items: Array<{ product_hs_code: string; weight: number; quantity: number }> }>;
  expect(boxes[0]!.weight).toBeGreaterThan(0.8); expect(boxes[0]!.items[0]).toMatchObject({ product_hs_code: product.hs_code, weight: 0.8, quantity: 1 });
  expect(fixture.requests.find((request) => request.url().endsWith('/shipment/carriers'))?.headers().authorization).toContain(credential);
});

test('successful login hides authentication and logout returns a fresh in-memory session', async ({ page }) => {
  await mockApi(page); await login(page);
  await expect(page.locator('#login-view')).toBeHidden(); await expect(page.locator('#authenticated-actions')).toBeVisible();
  await classifyAndAdd(page, '2'); await page.locator('#logout-button').click();
  await expect(page.locator('#login-view')).toBeVisible(); await expect(page.locator('#store-view')).toBeHidden();
  await expect(page.locator('#authenticated-actions')).toBeHidden(); await expect(page.locator('#encoded-key')).toHaveValue('');
  await expect(page.locator('#cart-count')).toHaveText('0'); await expect(page.locator('#checkout-button')).toBeDisabled();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test('typed HS search debounces, cancels stale work, and supports keyboard classification', async ({ page }) => {
  const searchUrls: string[] = [];
  await page.route(apiPattern, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/product/search/')) {
      searchUrls.push(route.request().url()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([product])) }); return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope([])) });
  });
  await login(page); const input = page.locator('[data-product-search="headgear"]');
  await input.fill('hel'); await page.waitForTimeout(200); expect(searchUrls).toHaveLength(0);
  await input.fill('helmet'); await page.waitForTimeout(100); await input.fill('head gear');
  const select = page.locator('[data-product-results="headgear"]'); await expect(select).toBeVisible(); expect(searchUrls).toHaveLength(1); expect(decodeURIComponent(searchUrls[0]!)).toContain('/product/search/head gear'); await expect(select).toContainText(product.name);
  await page.locator('[data-product="headgear"].quantity').fill('1'); await select.focus(); await select.press('ArrowDown'); await select.press('Enter');
  await expect(page.locator('[data-product-status="headgear"]')).toContainText(`HS ${product.hs_code}`); await expect(page.locator('#checkout-button')).toBeEnabled();
});

test('PayDemo review presents merchandise, selected delivery, carrier and full total before intent-bound purchase', async ({ page }) => {
  await mockApi(page); await login(page); await reachPayment(page);
  await expect(page.locator('#payment-context')).toContainText(rate.name); await expect(page.locator('#order-summary')).toContainText('18,500');
  await expect(page.locator('#order-summary')).toContainText('12,000'); await expect(page.locator('#order-summary')).toContainText('30,500');
  await expect(page.locator('#order-summary')).toContainText('Full order + delivery'); await expect(page.locator('#payment-status')).toHaveText('No payment has been attempted.');
});

test('manual host lab completes classified boxes, rates, full PayDemo, purchase, tracking and URL documents', async ({ page }) => {
  const fixture = await mockApi(page); await reachManualPayment(page);
  await expect(page.locator('.manual-payment')).toContainText(rate.name); await expect(page.locator('.manual-payment')).toContainText('30,500');
  await page.locator('#manual-pay').click(); await expect(page.locator('.manual-result')).toContainText('TRACK-UAT-1');
  await expect(page.locator('.manual-result .document-card')).toHaveCount(3); expect(fixture.purchaseCount).toBe(1);
  expect(fixture.purchase).toMatchObject({ file_is_url: 1, is_insured: '0', shipment_method_slug: rate.slug });
  const boxes = fixture.purchase?.boxes as Array<{ weight: number; items: Array<{ weight: number; quantity: number; product_hs_code: string }> }>;
  expect(boxes[0]).toMatchObject({ weight: 2 }); expect(boxes[0]!.items[0]).toMatchObject({ weight: 0.8, quantity: 1, product_hs_code: product.hs_code });
});

test('manual host lab validates classification before requesting rates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One engine covers builder validation; custom-element behavior has its own matrix.');
  const fixture = await mockApi(page); await manualLogin(page); const builder = page.locator('africanies-shipment-builder');
  for (let step = 0; step < 4; step += 1) await builder.getByRole('button', { name: 'Continue' }).click();
  await builder.getByRole('button', { name: /Create shipment/ }).click(); await expect(builder.getByRole('alert')).toContainText(/HS code|required/i);
  expect(fixture.requests.filter((request) => request.url().endsWith('/shipment/rates'))).toHaveLength(0);
});

for (const failure of ['definitive', 'uncertain'] as const) {
  test(`manual purchase treats ${failure} failures without unsafe automatic duplication`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One engine covers purchase-state policy.');
    const fixture = await mockApi(page, failure === 'definitive' ? { purchaseValidationFailure: true } : { purchaseFailure: true }); await reachManualPayment(page);
    await page.locator('#manual-pay').click(); await expect(page.locator('#manual-error')).toContainText(failure === 'definitive' ? 'Unit weight validation failed.' : /Reconcile/);
    await page.locator('#manual-pay').click();
    if (failure === 'definitive') expect(fixture.purchaseCount).toBe(2);
    else { await expect(page.locator('#manual-error')).toContainText('prior result is uncertain'); expect(fixture.purchaseCount).toBe(1); }
  });
}

test('insured checkout sends insurance flag and renders Base64 documents by authoritative flags', async ({ page }) => {
  const fixture = await mockApi(page, { purchaseData: purchaseResult(true, true) }); await login(page); await reachPayment(page, true); await page.locator('#pay-button').click();
  expect(fixture.purchase).toMatchObject({ file_is_url: 1, is_insured: '1' });
  await expect(page.locator('.document-card[download]')).toHaveCount(3); await expect(page.locator('.document-card[download]').first()).toHaveAttribute('href', /^blob:/);
  await expect(page.getByText('Not requested')).toHaveCount(0);
});

test('malformed Base64 document is reported without creating a download', async ({ page }) => {
  const data = purchaseResult(false, true); (data.documents as Record<string, unknown>).invoice_doc = 'not-base64!';
  await mockApi(page, { purchaseData: data }); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.getByText('Malformed Base64 document')).toBeVisible();
});

test('oversized Base64 document is rejected before browser decoding', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One engine is sufficient for the size guard; representation paths run across the matrix.');
  const data = purchaseResult(false, true); (data.documents as Record<string, unknown>).invoice_doc = 'A'.repeat(13_981_020);
  await mockApi(page, { purchaseData: data }); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.getByText('Base64 document exceeds the 10 MB browser download limit')).toBeVisible();
});

test('quantity two remains two physical units with exact unit weight and gross packaging semantics', async ({ page }) => {
  const fixture = await mockApi(page); await login(page); await reachPaymentWithQuantity(page, '2'); await page.locator('#pay-button').click();
  await expect(page.locator('#result-section')).toBeVisible(); expect(fixture.purchase).toBeDefined();
  const boxes = fixture.purchase?.boxes as Array<{ weight: number; items: Array<{ weight: number; quantity: number }> }>;
  const items = boxes.flatMap((box) => box.items);
  expect(items.reduce((total, item) => total + item.quantity, 0)).toBe(2);
  expect(items.every((item) => item.weight === 0.8)).toBe(true);
  expect(items.reduce((total, item) => total + item.weight * item.quantity, 0)).toBeCloseTo(1.6);
  expect(boxes).toHaveLength(1);
  expect(boxes.reduce((total, box) => total + box.weight, 0)).toBeCloseTo(2.3);
  expect(boxes.every((box) => box.weight >= box.items.reduce((total, item) => total + item.weight * item.quantity, 0))).toBe(true);
});

test('credential ping rejects invalid auth without leaking or persisting the credential', async ({ page }) => {
  await mockApi(page, { authFailure: true }); const consoleMessages: string[] = []; page.on('console', (message) => consoleMessages.push(message.text()));
  await page.goto('http://127.0.0.1:4174/'); await page.locator('#encoded-key').fill(credential); await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#login-status')).toContainText('Invalid credential'); await expect(page.locator('#store-view')).toBeHidden();
  await expect(page.locator('#encoded-key')).toHaveValue('');
  expect(page.url()).not.toContain(credential); expect(consoleMessages.join('\n')).not.toContain(credential);
  const persisted = await page.evaluate(() => ({ local: Object.values(localStorage), session: Object.values(sessionStorage), body: document.body.textContent }));
  expect(JSON.stringify(persisted)).not.toContain(credential);
});

test('a new Products search invalidates the previous HS selection and no-match blocks checkout', async ({ page }) => {
  let searches = 0;
  await page.route(apiPattern, async (route) => { const path = new URL(route.request().url()).pathname; let data: unknown = []; if (path.includes('/product/search/')) { searches += 1; data = searches === 1 ? [product] : []; } await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(envelope(data)) }); });
  await login(page); await classifyAndAdd(page); await page.locator('button[data-product="headgear"].search-product').click();
  await expect(page.locator('[data-product-status="headgear"]')).toContainText('No matching products'); await expect(page.locator('#checkout-button')).toBeDisabled();
});

for (const outcome of ['pending', 'failed', 'cancelled'] as const) {
  test(`PayDemo ${outcome} never calls purchase`, async ({ page }) => {
    const fixture = await mockApi(page); await login(page); await reachPayment(page);
    if (outcome === 'pending') await page.locator('#payment-outcome').evaluate((select) => select.append(new Option('Pending payment', 'pending')));
    await page.locator('#payment-outcome').selectOption(outcome); await page.locator('#pay-button').click();
    await expect(page.locator('#app-error')).toContainText(outcome); expect(fixture.purchaseCount).toBe(0);
  });
}

test('an uncertain purchase result is not automatically or manually duplicated', async ({ page }) => {
  const fixture = await mockApi(page, { purchaseFailure: true }); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.locator('#app-error')).toContainText(/Network request failed|uncertain/i); await page.locator('#pay-button').click();
  await expect(page.locator('#app-error')).toContainText('uncertain'); expect(fixture.purchaseCount).toBe(1);
});

test('a known API purchase rejection is surfaced and held for reconciliation without resubmission', async ({ page }) => {
  const fixture = await mockApi(page, { purchaseApiFailure: true }); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.locator('#app-error')).toContainText('External reference already paid.'); await page.locator('#pay-button').click();
  await expect(page.locator('#app-error')).toContainText('uncertain'); expect(fixture.purchaseCount).toBe(1);
});

test('a definitive 424 remains retryable but is never retried automatically', async ({ page }) => {
  const fixture = await mockApi(page, { purchaseValidationFailure: true }); await login(page); await reachPayment(page); await page.locator('#pay-button').click();
  await expect(page.locator('#app-error')).toContainText('Unit weight validation failed.');
  await expect(page.locator('#app-error')).not.toContainText('result is uncertain'); expect(fixture.purchaseCount).toBe(1);
});

test('required receiver fields block rates before a network request', async ({ page }) => {
  const fixture = await mockApi(page); await login(page); await classifyAndAdd(page); await page.locator('#checkout-button').click(); await page.locator('[name="country"]').fill('');
  await page.getByRole('button', { name: 'Calculate packaging and rates' }).click();
  expect(fixture.requests.filter((request) => request.url().endsWith('/shipment/rates'))).toHaveLength(0); await expect(page.locator('[name="country"]')).toBeFocused();
});

test('non-native whitespace address validation surfaces an SDK error before rates', async ({ page }) => {
  const fixture = await mockApi(page); await login(page); await classifyAndAdd(page); await page.locator('#checkout-button').click();
  await page.locator('[name="city"]').fill('   '); await page.getByRole('button', { name: 'Calculate packaging and rates' }).click();
  await expect(page.locator('#app-error')).toContainText(/city|required/i);
  expect(fixture.requests.filter((request) => request.url().endsWith('/shipment/rates'))).toHaveLength(0);
});

test('built Pages artifact loads and navigates both demo routes without asset or console failures', async ({ page }) => {
  const failures: string[] = []; const consoleErrors: string[] = [];
  page.on('requestfailed', (request) => failures.push(`${request.method()} ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle(/Africanies Store/); await expect(page.locator('.test-badge')).toContainText('SANDBOX · SFN');
  await expect(page.locator('#encoded-key')).toBeVisible(); await page.getByRole('link', { name: 'Manual packaging lab' }).click();
  await expect(page).toHaveURL(/manual\.html$/); await expect(page.locator('#manual-key')).toBeVisible(); await expect(page).toHaveTitle(/Manual Packaging Lab/);
  await page.getByRole('link', { name: 'Automatic checkout' }).click(); await expect(page.locator('#encoded-key')).toBeVisible();
  expect(failures).toEqual([]); expect(consoleErrors).toEqual([]);
});

test('mobile checkout remains usable without horizontal overflow and reports progress semantically', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'Mobile-specific responsive assertion');
  await mockApi(page); await login(page); await classifyAndAdd(page); await page.locator('#checkout-button').click();
  await expect(page.locator('[data-progress="1"]')).toHaveAttribute('aria-current', 'step');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Calculate packaging and rates' })).toBeVisible();
});
