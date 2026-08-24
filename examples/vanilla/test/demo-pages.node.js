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
  const [page, main] = await Promise.all([source('index.html'), source('src/main.js')]);
  assert.match(main, /scheduleProductSearch\(input\.dataset\.productSearch\)/);
  assert.match(main, /delete state\.productSearches\[productId\]; void startProductSearch\(productId\)/);
  assert.match(main, /controller\?\.abort\(\)/);
  assert.match(main, /Type at least 3 characters/);
  assert.match(main, /function productKeydown/);
  assert.match(main, /aria-activedescendant/);
  assert.match(main, /data-clear-product/);
  assert.match(page + main, /role=\"listbox\"/);
});

test('manual lab restores useful historical defaults without a hardcoded HS code', async () => {
  const manual = await source('src/manual.js');
  assert.match(manual, /length:'10',width:'10',height:'10',weight:'5'/);
  assert.match(manual, /name:'Electronics Accessories'.*weight:'1\.5'.*unit_price:1500/);
  assert.match(manual, /name:'Smartphone Case'.*weight:'0\.3'.*unit_price:1500/);
  assert.match(manual, /product_hs_code:''/);
});

test('payment results use structured, accessible payment records', async () => {
  const [main, manual, styles] = await Promise.all([source('src/main.js'), source('src/manual.js'), source('src/styles.css')]);
  assert.match(main, /payment-status-badge/); assert.match(main, /Merchandise/); assert.match(main, /Carrier/);
  assert.match(manual, /payment-record-head/); assert.match(styles, /payment-record-total/);
});

test('manual purchase distinguishes definitive validation failures from uncertain delivery', async () => {
  const manual = await source('src/manual.js');
  assert.match(manual, /isDefinitivePurchaseFailure/);
  assert.match(manual, /\[400,401,403,404,422,424\]/);
  assert.match(manual, /purchaseState==='uncertain'\?` Reconcile/);
});
