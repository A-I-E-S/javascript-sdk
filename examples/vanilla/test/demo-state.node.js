import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAREHOUSE_ADDRESS, DEMO_PRODUCTS, cartLines, cartTotals, createPackagingInput,
  packagingToRateBoxes, createRateRequest, shippingAmount, minimumAssignedDate, payDemoResult,
} from '../src/demo-state.js';

test('minimum assigned date advances across calendar boundaries', () => {
  assert.equal(minimumAssignedDate(new Date(2026, 11, 31, 23, 59)), '2027-01-01');
});

test('cart preserves configured unit measurements and calculates line totals', () => {
  const lines = cartLines({ headgear: 2, dress: 1 });
  assert.equal(lines.length, 2); assert.equal(lines[0].weight, 0.8); assert.equal(lines[0].quantity, 2);
  const totals = cartTotals(lines);
  assert.deepEqual({ quantity: totals.quantity, subtotal: totals.subtotal }, { quantity: 3, subtotal: 69000 });
  assert.ok(Math.abs(totals.unitWeightTotal - 2.15) < Number.EPSILON * 4);
});

test('packaging input uses selected API classification and configurable box settings', () => {
  const input = createPackagingInput(cartLines({ bag: 2 }), { bag: { hs_code: '4202990000', name: 'Travel goods' } });
  assert.deepEqual(input.settings.dimensionalAllowance, { length: 1, width: 1, height: 1 });
  assert.equal(input.settings.maxWeightPerBox, 30); assert.equal(input.items[0].unitWeight, 1.4);
  assert.equal(input.items[0].productHsCode, '4202990000'); assert.equal(input.items[0].productHsCodeDescription, 'Travel goods');
  assert.equal(input.settings.boxCatalog.length, 3);
});

test('packaging result uses the SDK-produced rate boxes without rewriting item weight', () => {
  const product = { ...DEMO_PRODUCTS[0], quantity: 3 }; const rateBoxes = [{ index: 1, length: 30, width: 26, height: 20, weight: 2.4,
    items: [{ name: product.name, weight: 0.8, quantity: 3, amount: product.price * 3 }] }];
  const boxes = packagingToRateBoxes({ valid: true, rateBoxes, boxes: [{}], issues: [], unpackedItems: [] });
  assert.strictEqual(boxes, rateBoxes);
  assert.equal(boxes[0].weight, 2.4); assert.equal(boxes[0].items[0].weight, 0.8);
  assert.equal(boxes[0].items[0].quantity, 3); assert.equal(boxes[0].items[0].amount, product.price * 3);
});

test('SFN request fixes Nigerian warehouse and sends insurance wire flag', () => {
  const receiver = { country: 'US' }; const request = createRateRequest(receiver, [{ index: 1 }], true);
  assert.equal(WAREHOUSE_ADDRESS.country, 'NG'); assert.equal(request.addresses.sender.country, 'NG');
  assert.strictEqual(request.addresses.receiver, receiver); assert.equal(request.is_insured, '1');
  assert.deepEqual(request.units, { dimension: 'cm', mass: 'KG' });
});

test('selected shipping amount is validated for host order totals', () => {
  assert.equal(shippingAmount({ payment_amount: '12500.50' }), 12500.5);
  assert.throws(() => shippingAmount({ payment_amount: 'unknown' }), /invalid shipping cost/);
});

test('PayDemo only confirms the successful simulation', () => {
  assert.equal(payDemoResult('success').confirmed, true); assert.equal(payDemoResult('failed').confirmed, false);
  assert.match(payDemoResult('cancelled').id, /^PAYDEMO-/);
});
