import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completePreparedPurchaseRequest,
  isAssignedDateValid,
  legacyPurchaseRequestForPresentation,
  minimumAssignedDate,
  normalizeCompletedRateRequest,
  sampleRateDraft,
} from '../src/demo-state.js';

test('minimum assigned date is tomorrow across calendar boundaries', () => {
  assert.equal(minimumAssignedDate(new Date(2026, 11, 31, 23, 59)), '2027-01-01');
  assert.equal(minimumAssignedDate(new Date(2028, 1, 28, 23, 59)), '2028-02-29');
});

test('assigned date accepts the minimum or later and rejects today', () => {
  assert.equal(isAssignedDateValid('2026-08-19', '2026-08-19'), true);
  assert.equal(isAssignedDateValid('2026-08-20', '2026-08-19'), true);
  assert.equal(isAssignedDateValid('2026-08-18', '2026-08-19'), false);
  assert.equal(isAssignedDateValid('', '2026-08-19'), false);
});

test('sample draft returns a fresh, exact-contract sample each time', () => {
  const first = sampleRateDraft();
  const second = sampleRateDraft();
  assert.notStrictEqual(first, second);
  assert.equal(first.addresses.sender.first_name, 'John');
  assert.equal(first.addresses.receiver.city, 'Boston');
  assert.deepEqual(first.boxes[0].items.map(({ name }) => name), [
    'Electronics Accessories',
    'Smartphone Case',
  ]);
  assert.equal(first.units.mass, 'KG');
  assert.equal(first.units.dimension, 'cm');
  assert.equal(first.last_mile_delivery, true);
  assert.equal(first.pickup, false);
  assert.equal(first.boxes[0].items[0].price, first.boxes[0].items[0].unit_price);
  assert.equal(first.boxes[0].items[0].product_hs_code_description, first.boxes[0].items[0].description);
  assert.deepEqual(sampleRateDraft('STN').units, { dimension: 'inches', mass: 'LBS' });
  assert.equal(sampleRateDraft('STN').last_mile_delivery, false);
  assert.equal(sampleRateDraft('STN').pickup, true);
});

test('normalizes legacy Stage 1 output to exact SFN and STN wire rules', () => {
  const legacy = sampleRateDraft('SFN');
  legacy.units = { dimension: 'INCHES', mass: 'lbs' };
  delete legacy.pickup;
  const sfn = normalizeCompletedRateRequest(legacy, 'SFN');
  assert.deepEqual(sfn.units, { dimension: 'cm', mass: 'KG' });
  assert.equal(sfn.last_mile_delivery, true);
  assert.equal(sfn.pickup, false);
  assert.equal(typeof sfn.boxes[0].length, 'number');
  assert.equal(typeof sfn.boxes[0].items[0].quantity, 'number');

  const stn = normalizeCompletedRateRequest(legacy, 'STN');
  assert.deepEqual(stn.units, { dimension: 'inches', mass: 'LBS' });
  assert.equal(stn.last_mile_delivery, false);
  assert.equal(stn.pickup, true);
});

test('completes legacy purchase currency and remains idempotent for 0.2', () => {
  const rate = { others: { currency: 'NGN' } };
  const legacy = completePreparedPurchaseRequest({ external_reference: 'ORDER-1' }, rate, 'SFN');
  assert.equal(legacy.currency, 'NGN');
  assert.deepEqual(completePreparedPurchaseRequest(legacy, rate, 'SFN'), legacy);
  assert.throws(
    () => completePreparedPurchaseRequest(legacy, { others: { currency: 'USD' } }, 'SFN'),
    /must use NGN/,
  );
});

test('isolates obsolete 0.1 STN presentation units from the canonical API request', () => {
  const canonical = {
    units: { dimension: 'inches', mass: 'LBS' },
    address: { sender: { city: 'Isolo' }, receiver: { city: 'Boston' } },
    currency: 'USD',
  };
  const presentation = legacyPurchaseRequestForPresentation(canonical, 'STN');
  assert.deepEqual(presentation.units, { dimension: 'INCHES', mass: 'lbs' });
  assert.deepEqual(presentation.address, canonical.address);
  assert.deepEqual(canonical.units, { dimension: 'inches', mass: 'LBS' });
  assert.strictEqual(legacyPurchaseRequestForPresentation(canonical, 'SFN'), canonical);
});
