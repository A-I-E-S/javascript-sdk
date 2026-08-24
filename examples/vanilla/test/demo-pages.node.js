import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('automatic demo exposes authenticated logout and full PayDemo context', async () => {
  const [page, main, shared] = await Promise.all([source('index.html'), source('src/main.js'), source('src/shared-checkout-ui.js')]);
  assert.match(page, /id="authenticated-actions"[^>]*hidden/);
  assert.match(page, /id="logout-button"/);
  assert.match(shared, /Secure fake gateway/);
  assert.match(shared, /payment-context/);
  assert.match(main, /function resetSession/);
  assert.match(main, /state\.client = null/);
  assert.match(main, /Full payment approved/);
  assert.match(main, /event\.submitter \?\?/);
  assert.match(main, /show\('shipping-section'\).*mountSharedRates.*error\(message\)/s);
});

test('automatic and manual packaging demos are distinct and mutually discoverable', async () => {
  const [automatic, manual, config] = await Promise.all([source('index.html'), source('manual.html'), source('vite.config.js')]);
  assert.match(automatic, /href="\.\/manual\.html"/);
  assert.match(manual, /href="\.\/"/);
  assert.match(manual, /Integrating-application choice/);
  assert.match(config, /manual:\s*fileURLToPath/);
});

test('automatic and manual checkout use one shared rates and PayDemo renderer', async () => {
  const [automatic,manual,shared]=await Promise.all([source('src/main.js'),source('src/manual.js'),source('src/shared-checkout-ui.js')]);
  for(const entry of [automatic,manual]){assert.match(entry,/mountSharedRates/);assert.match(entry,/mountSharedPayDemo/);}
  assert.match(shared,/class="shared-rates-panel"/);assert.match(shared,/class="shared-paydemo"/);
  assert.match(shared,/africanies-rate-selected/);assert.match(shared,/africanies-complete/);
  assert.match(shared,/Loading shipment carriers/);assert.match(shared,/No shipping rates were returned/);
  assert.match(shared,/shared-rate-refresh/);assert.match(manual,/error:message,onRefresh:showRates/);
  assert.match(shared,/active\?'Selected':'Select'/); assert.match(shared,/Selected shipping rate/);
});

test('automatic and manual checkout use one complete secure shipment-result renderer',async()=>{
  const [automatic,manual,shared]=await Promise.all([source('src/main.js'),source('src/manual.js'),source('src/shared-shipment-result.js')]);
  for(const entry of [automatic,manual])assert.match(entry,/mountSharedShipmentResult/);
  assert.match(shared,/class="shared-shipment-result"/);assert.match(shared,/MAX_BASE64_DOCUMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(shared,/url\.protocol === 'https:'/);assert.match(shared,/URL\.revokeObjectURL/);assert.match(shared,/Not requested/);
  assert.match(shared,/Malformed Base64 document/);assert.match(shared,/Required document unavailable/);
  assert.doesNotMatch(manual,/Not returned as HTTPS URL/);
});

test('automatic delivery uses dependent country and state selects', async () => {
  const [page,main]=await Promise.all([source('index.html'),source('src/main.js')]);
  assert.match(page,/id="receiver-country"[^>]*name="country"/); assert.match(page,/id="receiver-state"[^>]*name="state"/);
  assert.match(main,/receiver-country.*change/); assert.match(main,/populateReceiverStates\(\)/);
  assert.match(main,/value="">Select country/);
  assert.match(main,/shipmentMode:\s*'SFN'.*carriers\.list/s);
});

test('manual entry explicitly registers SDK browser elements for production bundles', async () => {
  const manual = await source('src/manual.js');
  assert.match(manual, /Shipping\.defineAfricaniesElements\(\)/);
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
  assert.match(manual, /name:'Head phones'.*weight:'1\.5'.*unit_price:1500/);
  assert.match(manual, /name:'Airpod'.*weight:'0\.3'.*unit_price:1500/);
  assert.match(manual, /product_hs_code:''/);
});

test('payment results use structured, accessible payment records', async () => {
  const [main, manual, shared, styles] = await Promise.all([source('src/main.js'), source('src/manual.js'), source('src/shared-shipment-result.js'), source('src/styles.css')]);
  assert.match(main, /mountSharedShipmentResult/); assert.match(manual, /mountSharedShipmentResult/);
  assert.match(shared, /payment-status-badge/); assert.match(shared, /Merchandise/); assert.match(shared, /Carrier/); assert.match(styles, /payment-record-total/);
});

test('manual purchase distinguishes definitive validation failures from uncertain delivery', async () => {
  const manual = await source('src/manual.js');
  assert.match(manual, /isDefinitivePurchaseFailure/);
  assert.match(manual, /\[400,401,403,404,422,424\]/);
  assert.match(manual, /purchaseState==='uncertain'\?` Reconcile/);
});
