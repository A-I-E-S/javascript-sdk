export const WAREHOUSE_ADDRESS = Object.freeze({
  first_name: 'Africanies', last_name: 'Demo Warehouse', email: 'warehouse@example.com', phone: '2348000000000',
  alternate_phone: null, country: 'NG', state: 'LA', city: 'Lagos', address: '17 Idowu Oshinfodunrin Street, Isaga Tedo, Lagos',
  address_in_detail: '17 Idowu Oshinfodunrin Street, Isaga Tedo, Lagos', address_landmark: 'Isaga Tedo', zip_code: '102214',
  type: 'sender', longitude: 3.3792, latitude: 6.5244, street_number: null, street_name: null, google_address: '0',
});

export const DEMO_PRODUCTS = Object.freeze([
  { id: 'headgear', name: 'Protective head gear', description: 'Lightweight protective head gear', hsCode: '6506100000', price: 18500, weight: 0.8, dimensions: { length: 28, width: 24, height: 18 }, origin: 'NG' },
  { id: 'dress', name: 'Cotton dress', description: 'Women’s woven cotton dress', hsCode: '6204420000', price: 32000, weight: 0.55, dimensions: { length: 32, width: 24, height: 5 }, origin: 'NG' },
  { id: 'bag', name: 'Leather travel bag', description: 'Handmade leather travel bag', hsCode: '4202910000', price: 48000, weight: 1.4, dimensions: { length: 45, width: 30, height: 20 }, origin: 'NG' },
]);

export const DEMO_PACKAGING_SETTINGS = Object.freeze({
  dimensionalAllowance: { length: 1, width: 1, height: 1 }, maxWeightPerBox: 30, allowRotation: true,
  boxCatalog: [
    { id: 'small', name: 'Small protective box', innerDimensions: { length: 35, width: 25, height: 15 }, emptyWeight: 0.3 },
    { id: 'medium', name: 'Medium protective box', innerDimensions: { length: 50, width: 40, height: 30 }, emptyWeight: 0.7 },
    { id: 'large', name: 'Large protective box', innerDimensions: { length: 70, width: 50, height: 45 }, emptyWeight: 1.2 },
  ],
});

export function localDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function minimumAssignedDate(now = new Date()) {
  const tomorrow = new Date(now); tomorrow.setHours(12, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateInputValue(tomorrow);
}

export function cartLines(cart, products = DEMO_PRODUCTS) {
  return products.flatMap((product) => {
    const quantity = Number(cart[product.id] ?? 0);
    return quantity > 0 ? [{ ...product, quantity }] : [];
  });
}

export function cartTotals(lines) {
  return lines.reduce((total, line) => ({
    quantity: total.quantity + line.quantity,
    subtotal: total.subtotal + line.price * line.quantity,
    unitWeightTotal: total.unitWeightTotal + line.weight * line.quantity,
  }), { quantity: 0, subtotal: 0, unitWeightTotal: 0 });
}

// The SDK automatic packager is injected at this boundary. The demo never carries a competing algorithm.
export function createPackagingInput(lines, classifications = {}) {
  return {
    items: lines.map((line) => {
      const classification = classifications[line.id];
      return { id: line.id, name: line.name, description: line.description,
        productHsCode: classification?.hs_code ?? line.hsCode,
        productHsCodeDescription: classification?.name ?? line.description, country: line.origin,
        quantity: line.quantity, unitWeight: line.weight, unitPrice: line.price,
        amount: line.price * line.quantity, dimensions: { ...line.dimensions } };
    }),
    settings: structuredClone(DEMO_PACKAGING_SETTINGS),
  };
}

export function packagingToRateBoxes(packaging) {
  if (!packaging?.valid || !Array.isArray(packaging.rateBoxes) || packaging.rateBoxes.length === 0) {
    const details = [...(packaging?.issues ?? []), ...(packaging?.unpackedItems ?? [])].map((issue) => issue.message).join(' ');
    throw new Error(details || 'Automatic packaging did not return any boxes.');
  }
  return packaging.rateBoxes;
}

export function receiverFromForm(form) {
  const value = Object.fromEntries(new FormData(form));
  return { first_name: value.first_name.trim(), last_name: value.last_name.trim(), email: value.email.trim(), phone: value.phone.trim(),
    alternate_phone: null, country: value.country.trim().toUpperCase(), state: value.state.trim(), city: value.city.trim(),
    address: value.address.trim(), address_in_detail: value.address.trim(), address_landmark: value.address_landmark.trim(),
    zip_code: value.zip_code.trim(), type: 'receiver', longitude: Number(value.longitude), latitude: Number(value.latitude),
    street_number: null, street_name: null, google_address: '0' };
}

export function createRateRequest(receiver, boxes, insured = false) {
  if (WAREHOUSE_ADDRESS.country !== 'NG') throw new Error('SFN requires a Nigerian sender address.');
  return { addresses: { sender: { ...WAREHOUSE_ADDRESS }, receiver }, boxes, units: { dimension: 'cm', mass: 'KG' },
    last_mile_delivery: true, pickup: false, is_insured: insured ? '1' : '0' };
}

export function shippingAmount(rate) {
  const amount = Number(rate?.payment_amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('The selected rate has an invalid shipping cost.');
  return amount;
}

export function payDemoResult(outcome = 'success', payment = {}) {
  return {
    id: `PAYDEMO-${Date.now()}`, status: outcome, confirmed: outcome === 'success',
    amount: Number(payment.amount ?? 0), currency: payment.currency ?? 'NGN',
  };
}
