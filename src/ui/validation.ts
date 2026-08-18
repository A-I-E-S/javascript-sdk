import type {
  PurchaseItem,
  ShipmentMode,
  ShipmentPurchaseRequest,
  ShipmentRateDraft,
  ShipmentRateRequest,
} from '../types.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function requiredString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path, message: 'This field is required.' });
  }
}

function finiteNumber(value: unknown, path: string, issues: ValidationIssue[]): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    issues.push({ path, message: 'Enter a valid non-negative number.' });
    return 0;
  }
  return parsed;
}

function finiteCoordinate(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): void {
  if (value === '' || (typeof value === 'string' && value.trim() === '')) {
    issues.push({ path, message: `Enter a number from ${minimum} to ${maximum}.` });
    return;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    issues.push({ path, message: `Enter a number from ${minimum} to ${maximum}.` });
  }
}

function validateAddresses(
  addresses: ShipmentRateDraft['addresses'] | ShipmentRateRequest['addresses'] | ShipmentPurchaseRequest['address'],
  root: string,
  issues: ValidationIssue[],
  contract: 'rate' | 'purchase',
): void {
  for (const role of ['sender', 'receiver'] as const) {
    const address = addresses?.[role];
    if (!address) {
      issues.push({ path: `${root}.${role}`, message: `${role} address is required.` });
      continue;
    }
    for (const field of [
      'first_name',
      'last_name',
      'email',
      'phone',
      'country',
      'state',
      'city',
      'address',
      'address_in_detail',
      'zip_code',
      'type',
    ] as const) {
      requiredString(address[field], `${root}.${role}.${field}`, issues);
    }
    if (contract === 'rate') {
      requiredString(address.address_landmark, `${root}.${role}.address_landmark`, issues);
      if (address.longitude === null || address.longitude === undefined) {
        issues.push({ path: `${root}.${role}.longitude`, message: 'This field is required.' });
      } else {
        finiteCoordinate(address.longitude, `${root}.${role}.longitude`, -180, 180, issues);
      }
      if (address.latitude === null || address.latitude === undefined) {
        issues.push({ path: `${root}.${role}.latitude`, message: 'This field is required.' });
      } else {
        finiteCoordinate(address.latitude, `${root}.${role}.latitude`, -90, 90, issues);
      }
      requiredString(address.google_address, `${root}.${role}.google_address`, issues);
    } else {
      for (const field of ['address_landmark', 'longitude', 'latitude', 'google_address'] as const) {
        if (!(field in address)) {
          issues.push({ path: `${root}.${role}.${field}`, message: 'This field is required and may be null.' });
        }
      }
    }
  }
}

export function validateShipmentUnits(
  units: ShipmentRateRequest['units'],
  shipmentMode: ShipmentMode,
): ValidationIssue[] {
  const expected =
    shipmentMode === 'SFN'
      ? { mass: 'KG', dimension: 'cm' }
      : { mass: 'lbs', dimension: 'INCHES' };
  const issues: ValidationIssue[] = [];
  if (units.mass !== expected.mass) {
    issues.push({
      path: 'units.mass',
      message: `${shipmentMode} shipments require ${expected.mass}.`,
    });
  }
  if (units.dimension !== expected.dimension) {
    issues.push({
      path: 'units.dimension',
      message: `${shipmentMode} shipments require ${expected.dimension}.`,
    });
  }
  return issues;
}

export function validateRateRequest(
  request: ShipmentRateRequest | ShipmentRateDraft,
  shipmentMode: ShipmentMode,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateAddresses(request.addresses, 'addresses', issues, 'rate');
  issues.push(...validateShipmentUnits(request.units, shipmentMode));
  if (!Array.isArray(request.boxes) || request.boxes.length === 0) {
    issues.push({ path: 'boxes', message: 'Add at least one box.' });
  } else {
    request.boxes.forEach((box, boxIndex) => {
      for (const field of ['index', 'length', 'width', 'height', 'weight'] as const) {
        requiredString(box[field], `boxes.${boxIndex}.${field}`, issues);
      }
      if (!Array.isArray(box.items) || box.items.length === 0) {
        issues.push({ path: `boxes.${boxIndex}.items`, message: 'Add at least one item.' });
      } else {
        box.items.forEach((item, itemIndex) => {
          for (const field of [
            'name',
            'description',
            'product_hs_code',
            'product_hs_code_description',
            'weight',
            'country',
            'quantity',
            'amount',
          ] as const) {
            requiredString(item[field], `boxes.${boxIndex}.items.${itemIndex}.${field}`, issues);
          }
          finiteNumber(item.price, `boxes.${boxIndex}.items.${itemIndex}.price`, issues);
          finiteNumber(item.unit_price, `boxes.${boxIndex}.items.${itemIndex}.unit_price`, issues);
        });
      }
    });
  }
  return { valid: issues.length === 0, issues };
}

export function validatePurchaseRequest(
  request: ShipmentPurchaseRequest,
  shipmentMode: ShipmentMode,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateAddresses(request.address, 'address', issues, 'purchase');
  issues.push(...validateShipmentUnits(request.units, shipmentMode));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.assigned_date)) {
    issues.push({ path: 'assigned_date', message: 'Use YYYY-MM-DD.' });
  }
  requiredString(request.external_reference, 'external_reference', issues);
  requiredString(request.shipment_method_slug, 'shipment_method_slug', issues);
  if (!Array.isArray(request.boxes) || request.boxes.length === 0) {
    issues.push({ path: 'boxes', message: 'Add at least one box.' });
  }
  return { valid: issues.length === 0, issues };
}

export interface ItemFileReferences {
  documents_s3_key?: string[];
  photos_s3_key?: string[];
}

export interface PurchasePreparationOptions {
  assignedDate: string;
  externalReference: string;
  shipmentMethodSlug: string;
  type?: string;
  productCode?: 'P' | 'D';
  fileIsUrl?: '0' | '1';
  itemFiles?: Record<string, ItemFileReferences>;
}

export type PurchasePreparationResult =
  | { success: true; request: ShipmentPurchaseRequest }
  | { success: false; issues: ValidationIssue[] };

export function preparePurchaseRequest(
  rateRequest: ShipmentRateRequest,
  options: PurchasePreparationOptions,
): PurchasePreparationResult {
  const issues: ValidationIssue[] = [];
  const boxes = rateRequest.boxes.map((box, boxIndex) => ({
    index: finiteNumber(box.index, `boxes.${boxIndex}.index`, issues),
    length: finiteNumber(box.length, `boxes.${boxIndex}.length`, issues),
    width: finiteNumber(box.width, `boxes.${boxIndex}.width`, issues),
    height: finiteNumber(box.height, `boxes.${boxIndex}.height`, issues),
    weight: finiteNumber(box.weight, `boxes.${boxIndex}.weight`, issues),
    items: box.items.map((item, itemIndex): PurchaseItem => {
      const files = options.itemFiles?.[`${box.index}:${itemIndex}`];
      return {
        name: item.name,
        product_hs_code: item.product_hs_code,
        product_hs_code_description: item.product_hs_code_description,
        description: item.description,
        weight: finiteNumber(item.weight, `boxes.${boxIndex}.items.${itemIndex}.weight`, issues),
        unit_price: finiteNumber(
          item.unit_price,
          `boxes.${boxIndex}.items.${itemIndex}.unit_price`,
          issues,
        ),
        quantity: finiteNumber(
          item.quantity,
          `boxes.${boxIndex}.items.${itemIndex}.quantity`,
          issues,
        ),
        amount: finiteNumber(item.amount, `boxes.${boxIndex}.items.${itemIndex}.amount`, issues),
        country: item.country,
        documents_s3_key: files?.documents_s3_key ?? [],
        photos_s3_key: files?.photos_s3_key ?? [],
      };
    }),
  }));

  requiredString(options.assignedDate, 'assigned_date', issues);
  requiredString(options.externalReference, 'external_reference', issues);
  requiredString(options.shipmentMethodSlug, 'shipment_method_slug', issues);
  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    request: {
      address: rateRequest.addresses,
      assigned_date: options.assignedDate,
      boxes,
      units: rateRequest.units,
      external_reference: options.externalReference,
      shipment_method_slug: options.shipmentMethodSlug,
      ...(rateRequest.is_insured === undefined ? {} : { is_insured: rateRequest.is_insured }),
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.productCode === undefined ? {} : { product_code: options.productCode }),
      ...(options.fileIsUrl === undefined ? {} : { file_is_url: options.fileIsUrl }),
    },
  };
}
