import type {
  ShipmentRateAddress,
  ShipmentPurchaseRequest,
  ShipmentRateRequest,
} from '../src/types.js';

export function shipmentAddress(type: 'sender' | 'receiver'): ShipmentRateAddress {
  return {
    first_name: type === 'sender' ? 'Ada' : 'Grace',
    last_name: 'Lovelace',
    email: `${type}@example.com`,
    phone: '1234567890',
    country: type === 'sender' ? 'NG' : 'US',
    state: type === 'sender' ? 'LA' : 'MA',
    city: type === 'sender' ? 'Lagos' : 'Boston',
    address: '1 Example Street',
    address_in_detail: '1 Example Street',
    address_landmark: 'Example landmark',
    zip_code: type === 'sender' ? '100001' : '02125',
    type,
    longitude: type === 'sender' ? 3.3792 : -71.0589,
    latitude: type === 'sender' ? 6.5244 : 42.3601,
    google_address: '0',
  };
}

export function rateRequest(): ShipmentRateRequest {
  return {
    addresses: { sender: shipmentAddress('sender'), receiver: shipmentAddress('receiver') },
    boxes: [
      {
        index: 0, length: 10, width: 10, height: 10, weight: 1.4,
        items: [{
          name: 'Phone', description: 'Smartphone', price: 650,
          product_hs_code: '8517130000', product_hs_code_description: 'Smartphones',
          weight: 1.4, unit_price: 650, country: 'NG', quantity: 1, amount: 650,
        }],
      },
    ],
    units: { dimension: 'cm', mass: 'KG' },
    last_mile_delivery: true,
    pickup: false,
    is_insured: '0',
  };
}

export function purchaseRequest(): ShipmentPurchaseRequest {
  return {
    address: { sender: shipmentAddress('sender'), receiver: shipmentAddress('receiver') },
    assigned_date: '2099-08-20',
    boxes: [{
      index: 0, length: 10, width: 10, height: 10, weight: 1.4,
      items: [{
        name: 'Phone', description: 'Smartphone', product_hs_code: '8517130000',
        product_hs_code_description: 'Smartphones', weight: 1.4, unit_price: 650,
        quantity: 1, amount: 650, country: 'NG', documents_s3_key: [], photos_s3_key: [],
      }],
    }],
    units: { dimension: 'cm', mass: 'KG' },
    currency: 'NGN',
    external_reference: 'ORDER-1001',
    shipment_method_slug: 'africanies_air_express_sfn',
  };
}
