import type { AfricaniesClient } from './client.js';
import { AfricaniesError } from './errors.js';
import type { PackagingResult } from './packaging.js';
import { assertShipmentGeography, inferShipmentMode } from './shipment-validation.js';
import type { ApiEnvelope, ShipmentMode, ShipmentPurchaseRequest, ShipmentPurchaseResult, ShipmentRate, ShipmentRateAddresses, ShipmentRateRequest } from './types.js';

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}` : JSON.stringify(value);
const fingerprint = (value: unknown): string => { let hash = 0x811c9dc5; for (const character of canonical(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 0x01000193); } return `aies-${(hash >>> 0).toString(16).padStart(8, '0')}`; };
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

export interface BuildRateRequestFromPackagingInput { addresses: ShipmentRateAddresses; shipmentMode?: ShipmentMode; packaging: PackagingResult; isInsured?: '0' | '1' }
export function buildRateRequestFromPackaging(input: BuildRateRequestFromPackagingInput): ShipmentRateRequest {
  if (!input.packaging.valid || input.packaging.unpackedItems.length || !input.packaging.rateBoxes.length) throw new AfricaniesError('Packaging must be valid and complete before requesting rates.', { category: 'validation', data: { issues: input.packaging.issues, unpackedItems: input.packaging.unpackedItems } });
  const mode = inferShipmentMode(input.addresses, input.shipmentMode);
  if (!mode) throw new AfricaniesError('Sender country is required before shipment mode can be inferred.', { category: 'validation' });
  assertShipmentGeography(mode, input.addresses, 'addresses');
  return { addresses: structuredClone(input.addresses), boxes: structuredClone(input.packaging.rateBoxes), units: mode === 'SFN' ? { mass: 'KG', dimension: 'cm' } : { mass: 'LBS', dimension: 'inches' }, last_mile_delivery: mode === 'SFN', pickup: mode === 'STN', ...(input.isInsured === undefined ? {} : { is_insured: input.isInsured }) };
}

export interface CheckoutShippingQuote { id: string; request: ShipmentRateRequest; packaging: PackagingResult; rates: readonly ShipmentRate[] }
export function createCheckoutShippingQuote(request: ShipmentRateRequest, packaging: PackagingResult, rates: readonly ShipmentRate[]): CheckoutShippingQuote {
  if (!packaging.valid || !rates.length) throw new AfricaniesError('A complete packaging result and at least one current rate are required.', { category: 'validation' });
  const mode: ShipmentMode = request.units.mass === 'KG' ? 'SFN' : 'STN'; assertShipmentGeography(mode, request.addresses, 'addresses');
  const value = { request: structuredClone(request), packaging: structuredClone(packaging), rates: structuredClone(rates) };
  if (canonical(request.boxes) !== canonical(packaging.rateBoxes)) throw new AfricaniesError('The packaging result does not belong to this rate request.', { category: 'validation' });
  return deepFreeze({ id: fingerprint(value), ...value });
}

export interface CheckoutRateSelection { quoteId: string; rate: ShipmentRate; shipmentMethodSlug: string; shippingCost: number; currency: string }
export function selectCheckoutRate(quote: CheckoutShippingQuote, slug: string): CheckoutRateSelection {
  if (quote.id !== fingerprint({ request: quote.request, packaging: quote.packaging, rates: quote.rates })) throw new AfricaniesError('The checkout quote changed and must be refreshed.', { category: 'validation' });
  const rate = quote.rates.find((candidate) => candidate.slug === slug); if (!rate) throw new AfricaniesError('Select a rate returned by the current rate request.', { category: 'validation' });
  const shippingCost = Number(rate.payment_amount); const mode: ShipmentMode = quote.request.units.mass === 'KG' ? 'SFN' : 'STN'; const currency = rate.others?.currency;
  if (!Number.isFinite(shippingCost) || shippingCost < 0) throw new AfricaniesError('The selected rate has an invalid shipping cost.', { category: 'validation' });
  if (rate.mode.toUpperCase() !== mode || currency !== (mode === 'SFN' ? 'NGN' : 'USD')) throw new AfricaniesError('The selected rate mode or currency does not match the current shipment.', { category: 'validation' });
  return deepFreeze({ quoteId: quote.id, rate: structuredClone(rate), shipmentMethodSlug: rate.slug, shippingCost, currency });
}

export interface CheckoutPurchaseIntent { id: string; quoteId: string; request: ShipmentPurchaseRequest; amount: number; currency: string }
export function createCheckoutPurchaseIntent(request: ShipmentPurchaseRequest, selection: CheckoutRateSelection): CheckoutPurchaseIntent {
  const mode: ShipmentMode = request.units.mass === 'KG' ? 'SFN' : 'STN'; assertShipmentGeography(mode, request.address, 'address');
  if (request.shipment_method_slug !== selection.shipmentMethodSlug || request.currency !== selection.currency || selection.rate.slug !== selection.shipmentMethodSlug || Number(selection.rate.payment_amount) !== selection.shippingCost || selection.rate.others.currency !== selection.currency) throw new AfricaniesError('Purchase request does not match the selected checkout rate.', { category: 'validation' });
  const value = { quoteId: selection.quoteId, request: structuredClone(request), amount: selection.shippingCost, currency: selection.currency };
  return deepFreeze({ id: fingerprint(value), ...value });
}

export interface PaymentConfirmation { confirmed: true; reference: string; confirmedAt: string; intentId: string; amount: number; currency: string }
export async function purchaseAfterPayment(client: AfricaniesClient, intent: CheckoutPurchaseIntent, payment: PaymentConfirmation, signal?: AbortSignal): Promise<ApiEnvelope<ShipmentPurchaseResult>> {
  const expectedId = fingerprint({ quoteId: intent.quoteId, request: intent.request, amount: intent.amount, currency: intent.currency });
  if (intent.id !== expectedId || payment.confirmed !== true || !payment.reference?.trim() || !Number.isFinite(Date.parse(payment.confirmedAt)) || payment.intentId !== intent.id || payment.amount !== intent.amount || payment.currency !== intent.currency) throw new AfricaniesError('Payment confirmation does not match the current immutable purchase intent.', { category: 'validation' });
  const mode = inferShipmentMode(intent.request.address, client.shipmentMode);
  if (!mode) throw new AfricaniesError('Sender country is required before shipment mode can be inferred.', { category: 'validation' });
  assertShipmentGeography(mode, intent.request.address, 'address'); return client.shipments.purchase(structuredClone(intent.request), signal);
}
