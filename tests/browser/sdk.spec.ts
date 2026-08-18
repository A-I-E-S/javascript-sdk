import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ url: '/africanies-shipping.global.js' });
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
  await page.setContent('<africanies-shipment-builder></africanies-shipment-builder>');
  const builder = page.locator('africanies-shipment-builder');

  await expect(builder).toHaveAttribute('data-environment', 'test');
  await expect(builder.locator('.test-mode')).toContainText('Test mode');
  await expect(builder.locator('.shell')).toBeVisible();

  await builder.evaluate((element) => element.setAttribute('environment', 'live'));
  await expect(builder).toHaveAttribute('data-environment', 'live');
  await expect(builder.locator('.test-mode')).toHaveCount(0);
});
