import type { AfricaniesClient } from './client.js';
import { AfricaniesError } from './errors.js';
import type { PackagingResult } from './packaging.js';
import type {
  ApiEnvelope,
  ShipmentMode,
  ShipmentPurchaseRequest,
  ShipmentPurchaseResult,
  ShipmentRate,
  ShipmentRateAddresses,
  ShipmentRateRequest,
} from './types.js';

export interface BuildRateRequestFromPackagingInput {
  addresses: ShipmentRateAddresses;
  shipmentMode: ShipmentMode;
  packaging: PackagingResult;
  isInsured?: '0' | '1';
}

export function buildRateRequestFromPackaging(input: BuildRateRequestFromPackagingInput): ShipmentRateRequest {
  if (!input.packaging.valid || input.packaging.unpackedItems.length || !input.packaging.rateBoxes.length) {
    throw new AfricaniesError('Packaging must be valid and complete before requesting rates.', {
      category: 'validation', data: { issues: input.packaging.issues, unpackedItems: input.packaging.unpackedItems },
    });
  }
  return {
    addresses: structuredClone(input.addresses),
    boxes: structuredClone(input.packaging.rateBoxes),
    units: input.shipmentMode === 'SFN' ? { mass: 'KG', dimension: 'cm' } : { mass: 'LBS', dimension: 'inches' },
    last_mile_delivery: input.shipmentMode === 'SFN',
    pickup: input.shipmentMode === 'STN',
    ...(input.isInsured === undefined ? {} : { is_insured: input.isInsured }),
  };
}

export interface CheckoutRateSelection {
  rate: ShipmentRate;
  shipmentMethodSlug: string;
  shippingCost: number;
  currency: string;
}

export function selectCheckoutRate(rates: readonly ShipmentRate[], slug: string): CheckoutRateSelection {
  const rate = rates.find((candidate) => candidate.slug === slug);
  if (!rate) throw new AfricaniesError('Select a rate returned by the current rate request.', { category: 'validation' });
  const shippingCost = Number(rate.payment_amount);
  if (!Number.isFinite(shippingCost) || shippingCost < 0) throw new AfricaniesError('The selected rate has an invalid shipping cost.', { category: 'validation' });
  if (typeof rate.others?.currency !== 'string' || !rate.others.currency.trim()) throw new AfricaniesError('The selected rate has no valid currency.', { category: 'validation' });
  return { rate: structuredClone(rate), shipmentMethodSlug: rate.slug, shippingCost, currency: rate.others.currency };
}

export interface PaymentConfirmation {
  confirmed: true;
  reference: string;
  confirmedAt: string;
  amount?: number;
  currency?: string;
}

export async function purchaseAfterPayment(
  client: AfricaniesClient,
  request: ShipmentPurchaseRequest,
  payment: PaymentConfirmation,
  signal?: AbortSignal,
): Promise<ApiEnvelope<ShipmentPurchaseResult>> {
  if (payment.confirmed !== true || !payment.reference?.trim() || !Number.isFinite(Date.parse(payment.confirmedAt))) {
    throw new AfricaniesError('A valid host payment confirmation is required before shipment purchase.', { category: 'validation' });
  }
  return client.shipments.purchase(request, signal);
}
