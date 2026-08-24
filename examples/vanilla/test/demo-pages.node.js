import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('automatic demo exposes authenticated logout and full PayDemo context', async () => {
  const [page, main] = await Promise.all([source('index.html'), source('src/main.js')]);
  assert.match(page, /id="authenticated-actions"[^>]*hidden/);
  assert.match(page, /id="logout-button"/);
  assert.match(page, /Secure fake gateway/);
  assert.match(page, /id="payment-context"/);
  assert.match(main, /function resetSession/);
  assert.match(main, /state\.client = null/);
  assert.match(main, /Full payment approved/);
});

test('automatic and manual packaging demos are distinct and mutually discoverable', async () => {
  const [automatic, manual, config] = await Promise.all([source('index.html'), source('manual.html'), source('vite.config.js')]);
  assert.match(automatic, /href="\.\/manual\.html"/);
  assert.match(manual, /href="\.\/"/);
  assert.match(manual, /Integrating-application choice/);
  assert.match(config, /manual:\s*fileURLToPath/);
});

test('product classification supports debounced typed search and cancellation', async () => {
  const main = await source('src/main.js');
  assert.match(main, /setTimeout\(\(\) => void startProductSearch\(productId\), 350\)/);
  assert.match(main, /controller\?\.abort\(\)/);
  assert.match(main, /Type at least 3 characters/);
});

test('manual purchase distinguishes definitive validation failures from uncertain delivery', async () => {
  const manual = await source('src/manual.js');
  assert.match(manual, /isDefinitivePurchaseFailure/);
  assert.match(manual, /\[400,401,403,404,422,424\]/);
  assert.match(manual, /purchaseState==='uncertain'\?` Reconcile/);
});
