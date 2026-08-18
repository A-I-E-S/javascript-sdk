import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  NumericString,
  PurchaseDocuments,
  RateBox,
  RateCharges,
  ShipmentCurrencyForMode,
  ShipmentPurchaseAddress,
  ShipmentPurchaseRequest,
  ShipmentRate,
  ShipmentUnitsForMode,
} from '../src/types.js';
import {
  sanitizedPurchaseRequest,
  sanitizedPurchaseResponse,
  sanitizedRateRequest,
  sanitizedRateResponse,
} from './contract-fixtures.js';

describe('sanitized observed wire contracts', () => {
  it('accepts the corrected rate request without legacy-only item fields', () => {
    expect(sanitizedRateRequest.boxes[0]?.length).toBeTypeOf('number');
    expect(sanitizedRateRequest.boxes[0]?.items[0]).not.toHaveProperty('price');
    expect(sanitizedRateRequest.boxes[0]?.items[0]).not.toHaveProperty(
      'product_hs_code_description',
    );
    expect(sanitizedRateRequest).toMatchObject({
      last_mile_delivery: true,
      pickup: false,
    });
    expect(sanitizedRateResponse.data[0]?.slug).toBe('africanies_sample_sfn');
    expect(sanitizedRateResponse.data[0]?.charges.pickup_cost).toBeTypeOf('number');
    expect(sanitizedRateResponse.data[0]?.charges.vat).toBeTypeOf('number');
    expect(sanitizedRateResponse.data[0]?.payment_amount).toBeTypeOf('string');
  });

  it('accepts corrected purchase request and nullable response documents', () => {
    expect(sanitizedPurchaseRequest).toMatchObject({ currency: 'NGN', file_is_url: 1 });
    expect(sanitizedPurchaseRequest.boxes[0]?.items[0]).not.toHaveProperty(
      'documents_s3_key',
    );
    expect(sanitizedPurchaseResponse.data.documents.waybill_doc).toBeNull();
    expect(sanitizedPurchaseResponse.data.documents.invoice_doc).toMatch(/^https:/);
  });

  it('exports precise mode currency and observed coordinate types', () => {
    expectTypeOf<ShipmentCurrencyForMode<'SFN'>>().toEqualTypeOf<'NGN'>();
    expectTypeOf<ShipmentCurrencyForMode<'STN'>>().toEqualTypeOf<'USD'>();
    expectTypeOf<ShipmentUnitsForMode<'SFN'>>().toEqualTypeOf<{
      mass: 'KG';
      dimension: 'cm';
    }>();
    expectTypeOf<ShipmentUnitsForMode<'STN'>>().toEqualTypeOf<{
      mass: 'LBS';
      dimension: 'inches';
    }>();
    expectTypeOf<ShipmentPurchaseAddress['longitude']>().toEqualTypeOf<
      number | `${number}` | null
    >();
    expectTypeOf<PurchaseDocuments['waybill_doc']>().toEqualTypeOf<string | null>();
    expectTypeOf<RateCharges['shipment_cost']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<RateCharges['insurance_cost']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<RateCharges['pickup_cost']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<RateCharges['last_mile_delivery_cost']>().toEqualTypeOf<
      number | NumericString
    >();
    expectTypeOf<RateCharges['vat']>().toEqualTypeOf<
      number | NumericString | null | undefined
    >();
    expectTypeOf<ShipmentRate['total_amount']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<ShipmentRate['discount_amount']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<ShipmentRate['payment_amount']>().toEqualTypeOf<number | NumericString>();
    expectTypeOf<ShipmentRate['total_item_value']>().toEqualTypeOf<number | NumericString>();
  });

  it('rejects superseded compile-time assumptions', () => {
    // @ts-expect-error exact rate dimensions are numeric
    const legacyRateLength: RateBox['length'] = '30';
    // @ts-expect-error file_is_url uses a numeric flag on the wire
    const legacyFileFlag: NonNullable<ShipmentPurchaseRequest['file_is_url']> = '1';
    // @ts-expect-error SFN purchase currency is NGN
    const wrongSfnCurrency: ShipmentCurrencyForMode<'SFN'> = 'USD';

    expect([legacyRateLength, legacyFileFlag, wrongSfnCurrency]).toHaveLength(3);
  });
});
