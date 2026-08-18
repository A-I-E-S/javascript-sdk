export function localDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function minimumAssignedDate(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(12, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateInputValue(tomorrow);
}

export function isAssignedDateValid(value, minimum) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= minimum;
}

export function normalizeCompletedRateRequest(request, mode) {
  const isSfn = mode === 'SFN';
  return {
    ...structuredClone(request),
    units: isSfn ? { dimension: 'cm', mass: 'KG' } : { dimension: 'inches', mass: 'LBS' },
    last_mile_delivery: isSfn,
    pickup: !isSfn,
    boxes: request.boxes.map((box) => ({
      ...box,
      index: Number(box.index),
      length: Number(box.length),
      width: Number(box.width),
      height: Number(box.height),
      weight: Number(box.weight),
      items: box.items.map((item) => ({
        ...item,
        weight: Number(item.weight),
        unit_price: Number(item.unit_price),
        quantity: Number(item.quantity),
        amount: Number(item.amount),
        ...(item.price === undefined ? {} : { price: Number(item.price) }),
      })),
    })),
  };
}

export function completePreparedPurchaseRequest(request, rate, mode) {
  const expectedCurrency = mode === 'SFN' ? 'NGN' : 'USD';
  if (rate?.others?.currency !== expectedCurrency) {
    throw new Error(`${mode} rates must use ${expectedCurrency}.`);
  }
  if (request.currency !== undefined && request.currency !== expectedCurrency) {
    throw new Error(`${mode} purchases must use ${expectedCurrency}.`);
  }
  return { ...request, currency: expectedCurrency };
}

export function legacyPurchaseRequestForPresentation(request, mode) {
  if (mode !== 'STN') return request;
  return {
    ...structuredClone(request),
    units: { dimension: 'INCHES', mass: 'lbs' },
  };
}

export function sampleRateDraft(mode = 'SFN') {
  const isSfn = mode === 'SFN';
  return {
    addresses: {
      sender: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'sender@example.com',
        phone: '1234567890',
        alternate_phone: null,
        country: 'NG',
        state: 'LA',
        city: 'Isolo',
        address: '17 Idowu Oshinfodunrin St, Isaga Tedo, Lagos 102214, Lagos, Nigeria',
        address_in_detail: '17 Idowu Oshinfodunrin St, Isaga Tedo, Lagos 102214, Lagos, Nigeria',
        address_landmark: '17 Idowu Oshinfodunrin St, Isaga Tedo, Lagos 102214, Lagos, Nigeria',
        zip_code: '102214',
        type: 'sender',
        longitude: 3.3792,
        latitude: 6.5244,
        street_number: null,
        street_name: null,
        google_address: '0',
      },
      receiver: {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'receiver@example.com',
        phone: '0987654321',
        alternate_phone: null,
        country: 'US',
        state: 'MA',
        city: 'Boston',
        address: '17 Maryland St Boston MA USA',
        address_in_detail: '17 Maryland St Boston MA USA',
        address_landmark: '17 Maryland St Boston MA USA',
        zip_code: '02125',
        type: 'receiver',
        longitude: -71.0598,
        latitude: 42.3601,
        street_number: null,
        street_name: null,
        google_address: '0',
      },
    },
    boxes: [{
      length: '10',
      width: '10',
      height: '10',
      weight: '5',
      index: '1',
      items: [{
        name: 'Electronics Accessories',
        product_hs_code: '0101210000',
        description: 'This is an item',
        product_hs_code_description: 'This is an item',
        weight: '1.5',
        price: 1500,
        unit_price: 1500,
        quantity: '1',
        amount: '1500',
        country: 'NG',
      }, {
        name: 'Smartphone Case',
        product_hs_code: '0101210000',
        description: 'This is another item',
        product_hs_code_description: 'This is another item',
        weight: '0.3',
        price: 1500,
        unit_price: 1500,
        quantity: '1',
        amount: '1500',
        country: 'NG',
      }],
    }],
    units: isSfn ? { dimension: 'cm', mass: 'KG' } : { dimension: 'inches', mass: 'LBS' },
    last_mile_delivery: isSfn,
    pickup: !isSfn,
  };
}
