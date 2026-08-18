import type {
  ApiEnvelope,
  ShipmentPurchaseRequest,
  ShipmentPurchaseResult,
  ShipmentRate,
  ShipmentRateRequest,
} from '../src/types.js';

const sender = {
  first_name: 'Ada',
  last_name: 'Okafor',
  email: 'sender@example.test',
  phone: '08000000001',
  country: 'NG',
  state: 'LA',
  city: 'Lagos',
  address: '1 Example Road',
  address_in_detail: 'Warehouse entrance',
  address_landmark: 'Example junction',
  zip_code: '100001',
  type: 'sender',
  longitude: 3.3792,
  latitude: 6.5244,
  google_address: '0',
} as const;

const rateReceiver = {
  first_name: 'Sam',
  last_name: 'Taylor',
  email: 'receiver@example.test',
  phone: '12025550199',
  country: 'US',
  state: 'DC',
  city: 'Washington',
  address: '2 Sample Street',
  address_in_detail: 'Suite 2',
  address_landmark: 'Sample park',
  zip_code: '20001',
  type: 'receiver',
  longitude: -77.0369,
  latitude: 38.9072,
  google_address: '0',
} as const;

export const sanitizedRateRequest = {
  addresses: { sender, receiver: rateReceiver },
  boxes: [{
    index: 0,
    length: 30,
    width: 20,
    height: 10,
    weight: 2.5,
    items: [{
      name: 'Sample item',
      description: 'Non-sensitive sample merchandise',
      product_hs_code: '8517130000',
      weight: 2.5,
      unit_price: 25_000,
      country: 'NG',
      quantity: 1,
      amount: 25_000,
    }],
  }],
  units: { dimension: 'cm', mass: 'KG' },
  last_mile_delivery: true,
  pickup: false,
  is_insured: '0',
} satisfies ShipmentRateRequest;

export const sanitizedRateResponse = {
  success: true,
  status_code: 200,
  message: 'Rates retrieved',
  data: [{
    name: 'AfricanIES sample service',
    slug: 'africanies_sample_sfn',
    charges: {
      shipment_cost: '12500',
      insurance_cost: 0,
      pickup_cost: 0,
      last_mile_delivery_cost: '0',
      vat: 937.5,
    },
    total_amount: '13437.5',
    discount_amount: 0,
    payment_amount: '13437.5',
    total_item_value: '25000',
    others: { min_day: '3', max_day: '5', currency: 'NGN' },
    mode: 'sfn',
  }],
} satisfies ApiEnvelope<ShipmentRate[]>;

export const sanitizedPurchaseRequest = {
  address: {
    sender,
    receiver: {
      ...rateReceiver,
      longitude: '-77.0369',
      latitude: '38.9072',
    },
  },
  assigned_date: '2026-08-20',
  boxes: [{
    index: 0,
    length: 30,
    width: 20,
    height: 10,
    weight: 2.5,
    items: [{
      name: 'Sample item',
      product_hs_code: '8517130000',
      description: 'Non-sensitive sample merchandise',
      weight: 2.5,
      unit_price: 25_000,
      quantity: 1,
      amount: 25_000,
      country: 'NG',
    }],
  }],
  units: { dimension: 'cm', mass: 'KG' },
  currency: 'NGN',
  external_reference: 'SDK-SAMPLE-0001',
  shipment_method_slug: 'africanies_sample_sfn',
  file_is_url: 1,
} satisfies ShipmentPurchaseRequest;

export const sanitizedPurchaseResponse = {
  success: true,
  status_code: 200,
  message: 'Shipment purchased',
  data: {
    reference: 'EX-SAMPLE-0001',
    tracking_number: 'TRACK-SAMPLE-0001',
    tracking_url: 'https://example.test/track/TRACK-SAMPLE-0001',
    documents: {
      waybill_doc: null,
      insurance_doc: null,
      invoice_doc: 'https://example.test/documents/invoice.pdf',
    },
    waybill_is_url: 0,
    insurance_is_url: 0,
    invoice_is_url: 1,
    mode: 'sfn',
  },
} satisfies ApiEnvelope<ShipmentPurchaseResult>;
