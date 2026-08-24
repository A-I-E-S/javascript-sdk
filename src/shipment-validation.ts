import { AfricaniesError } from './errors.js';
import type { ShipmentMode, ShipmentPurchaseAddresses, ShipmentPurchaseRequest, ShipmentRateAddresses, ShipmentRateDraftAddresses, ShipmentRateRequest } from './types.js';

export interface ShipmentGeographyIssue { path: string; message: string }
type AddressPairs = ShipmentRateAddresses | ShipmentRateDraftAddresses | ShipmentPurchaseAddresses;

export function isNigeriaCountry(value: unknown): boolean {
  return typeof value === 'string' && ['NG', 'NGA', 'NIGERIA'].includes(value.trim().toUpperCase());
}

export function shipmentGeographyIssues(shipmentMode: ShipmentMode, addresses: AddressPairs, root: 'addresses' | 'address'): ShipmentGeographyIssue[] {
  const role = shipmentMode === 'SFN' ? 'sender' : 'receiver';
  if (isNigeriaCountry(addresses?.[role]?.country)) return [];
  return [{ path: `${root}.${role}.country`, message: shipmentMode === 'SFN'
    ? 'SFN means Ship From Nigeria; sender country must be Nigeria.'
    : 'STN means Ship To Nigeria; receiver country must be Nigeria.' }];
}

export function assertShipmentGeography(shipmentMode: ShipmentMode, addresses: AddressPairs, root: 'addresses' | 'address'): void {
  const issues = shipmentGeographyIssues(shipmentMode, addresses, root);
  if (issues.length) throw new AfricaniesError(issues[0]!.message, { category: 'validation', data: issues });
}

const requiredAddressFields = ['first_name', 'last_name', 'email', 'phone', 'country', 'state', 'city', 'address', 'address_in_detail', 'zip_code', 'type'] as const;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function shipmentRequestIssues(
  request: ShipmentRateRequest | ShipmentPurchaseRequest,
  shipmentMode: ShipmentMode,
  contract: 'rate' | 'purchase',
): ShipmentGeographyIssue[] {
  const root = contract === 'rate' ? 'addresses' : 'address';
  const addresses = contract === 'rate'
    ? (request as ShipmentRateRequest).addresses
    : (request as ShipmentPurchaseRequest).address;
  const issues = shipmentGeographyIssues(shipmentMode, addresses, root);
  const expectedUnits = shipmentMode === 'SFN' ? { mass: 'KG', dimension: 'cm' } as const : { mass: 'LBS', dimension: 'inches' } as const;
  if (request.units?.mass !== expectedUnits.mass) issues.push({ path: 'units.mass', message: `${shipmentMode} shipments require ${expectedUnits.mass}.` });
  if (request.units?.dimension !== expectedUnits.dimension) issues.push({ path: 'units.dimension', message: `${shipmentMode} shipments require ${expectedUnits.dimension}.` });
  if (contract === 'rate') {
    const rate = request as ShipmentRateRequest;
    if (rate.last_mile_delivery !== (shipmentMode === 'SFN')) issues.push({ path: 'last_mile_delivery', message: `${shipmentMode} shipment delivery preference is invalid.` });
    if (rate.pickup !== (shipmentMode === 'STN')) issues.push({ path: 'pickup', message: `${shipmentMode} shipment pickup preference is invalid.` });
  } else {
    const purchase = request as ShipmentPurchaseRequest;
    const expectedCurrency = shipmentMode === 'SFN' ? 'NGN' : 'USD';
    if (purchase.currency !== expectedCurrency) issues.push({ path: 'currency', message: `${shipmentMode} purchases require ${expectedCurrency}.` });
    if (typeof purchase.external_reference !== 'string' || !purchase.external_reference.trim()) issues.push({ path: 'external_reference', message: 'This field is required.' });
    if (typeof purchase.shipment_method_slug !== 'string' || !purchase.shipment_method_slug.trim()) issues.push({ path: 'shipment_method_slug', message: 'This field is required.' });
    if (purchase.file_is_url !== undefined && purchase.file_is_url !== 0 && purchase.file_is_url !== 1) issues.push({ path: 'file_is_url', message: 'Use the numeric flag 0 or 1.' });
  }
  if (request.is_insured !== undefined && request.is_insured !== '0' && request.is_insured !== '1') issues.push({ path: 'is_insured', message: 'Use the string flag "0" or "1".' });
  for (const role of ['sender', 'receiver'] as const) {
    const address = addresses?.[role];
    if (!address) {
      issues.push({ path: `${root}.${role}`, message: `${role} address is required.` });
      continue;
    }
    for (const field of requiredAddressFields) {
      if (typeof address[field] !== 'string' || !address[field].trim()) {
        issues.push({ path: `${root}.${role}.${field}`, message: 'This field is required.' });
      }
    }
  }
  if (!Array.isArray(request.boxes) || request.boxes.length === 0) {
    issues.push({ path: 'boxes', message: 'Add at least one box.' });
    return issues;
  }
  const indexes = new Set<number>();
  request.boxes.forEach((box, boxIndex) => {
    const boxPath = `boxes.${boxIndex}`;
    if (!Number.isInteger(box.index) || box.index < 0 || indexes.has(box.index)) {
      issues.push({ path: `${boxPath}.index`, message: 'Box index must be a unique non-negative integer.' });
    }
    indexes.add(box.index);
    for (const field of ['length', 'width', 'height', 'weight'] as const) {
      if (!positive(box[field])) issues.push({ path: `${boxPath}.${field}`, message: 'Enter a number greater than zero.' });
    }
    if (!Array.isArray(box.items) || box.items.length === 0) {
      issues.push({ path: `${boxPath}.items`, message: 'Add at least one item.' });
      return;
    }
    let derivedWeight = 0;
    box.items.forEach((item, itemIndex) => {
      const itemPath = `${boxPath}.items.${itemIndex}`;
      for (const field of ['name', 'description', 'product_hs_code', 'country'] as const) {
        if (typeof item[field] !== 'string' || !item[field].trim()) issues.push({ path: `${itemPath}.${field}`, message: 'This field is required.' });
      }
      if (!positive(item.weight)) issues.push({ path: `${itemPath}.weight`, message: 'Enter the unit weight as a number greater than zero; the backend records quantity × unit weight.' });
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) issues.push({ path: `${itemPath}.quantity`, message: 'Enter a positive whole-number quantity.' });
      if (!nonNegative(item.unit_price)) issues.push({ path: `${itemPath}.unit_price`, message: 'Enter a valid non-negative number.' });
      if (!nonNegative(item.amount)) issues.push({ path: `${itemPath}.amount`, message: 'Enter a valid non-negative number.' });
      if (positive(item.weight) && Number.isInteger(item.quantity) && item.quantity > 0) derivedWeight += item.weight * item.quantity;
    });
    if (positive(box.weight) && box.weight + 1e-9 < derivedWeight) {
      issues.push({ path: `${boxPath}.weight`, message: `Box weight cannot be less than its quantity × unit-weight total (${derivedWeight}).` });
    }
  });
  return issues;
}

export function assertShipmentRequest(
  request: ShipmentRateRequest | ShipmentPurchaseRequest,
  shipmentMode: ShipmentMode,
  contract: 'rate' | 'purchase',
): void {
  const issues = shipmentRequestIssues(request, shipmentMode, contract);
  if (issues.length) throw new AfricaniesError('Shipment request contains invalid fields.', { category: 'validation', data: issues });
}
