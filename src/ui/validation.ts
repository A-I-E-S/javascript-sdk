import type {
  PurchaseItem,
  ShipmentCurrency,
  ShipmentMode,
  ShipmentPurchaseRequest,
  ShipmentRate,
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

function isNigeria(value: unknown): boolean {
  return typeof value === 'string' && ['NG', 'NGA', 'NIGERIA'].includes(value.trim().toUpperCase());
}

export function validateShipmentGeography(
  shipmentMode: ShipmentMode,
  addresses: ShipmentRateDraft['addresses'] | ShipmentRateRequest['addresses'] | ShipmentPurchaseRequest['address'],
  root: 'addresses' | 'address' = 'addresses',
): ValidationIssue[] {
  const role = shipmentMode === 'SFN' ? 'sender' : 'receiver';
  if (isNigeria(addresses?.[role]?.country)) return [];
  return [{
    path: `${root}.${role}.country`,
    message: shipmentMode === 'SFN'
      ? 'SFN means Ship From Nigeria; sender country must be Nigeria.'
      : 'STN means Ship To Nigeria; receiver country must be Nigeria.',
  }];
}

function requiredString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push({ path, message: 'This field is required.' });
  }
}

function finiteNumber(value: unknown, path: string, issues: ValidationIssue[]): number {
  if (value === '' || (typeof value === 'string' && value.trim() === '')) {
    issues.push({ path, message: 'Enter a valid non-negative number.' });
    return 0;
  }
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

function finiteNullableCoordinate(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): void {
  if (value === null) return;
  const numericString = typeof value === 'string'
    && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim());
  if (typeof value !== 'number' && !numericString) {
    issues.push({ path, message: `Use null or a finite number from ${minimum} to ${maximum}.` });
    return;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    issues.push({ path, message: `Use null or a finite number from ${minimum} to ${maximum}.` });
  }
}

function validateAssignedDate(
  value: unknown,
  referenceDate: Date,
  issues: ValidationIssue[],
): void {
  const dateMatch = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : null;
  const assignedDate = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12)
    : undefined;
  const isRealDate = assignedDate !== undefined
    && assignedDate.getFullYear() === Number(dateMatch?.[1])
    && assignedDate.getMonth() === Number(dateMatch?.[2]) - 1
    && assignedDate.getDate() === Number(dateMatch?.[3]);
  if (!isRealDate) {
    issues.push({ path: 'assigned_date', message: 'Use a real calendar date in YYYY-MM-DD format.' });
    return;
  }
  const today = new Date(referenceDate);
  today.setHours(12, 0, 0, 0);
  if (assignedDate <= today) {
    issues.push({ path: 'assigned_date', message: 'Choose a date after today.' });
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
      if ('longitude' in address) {
        finiteNullableCoordinate(address.longitude, `${root}.${role}.longitude`, -180, 180, issues);
      }
      if ('latitude' in address) {
        finiteNullableCoordinate(address.latitude, `${root}.${role}.latitude`, -90, 90, issues);
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
      : { mass: 'LBS', dimension: 'inches' };
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
  issues.push(...validateShipmentGeography(shipmentMode, request.addresses, 'addresses'));
  issues.push(...validateShipmentUnits(request.units, shipmentMode));
  const expectedPreferences = shipmentMode === 'SFN'
    ? { lastMileDelivery: true, pickup: false }
    : { lastMileDelivery: false, pickup: true };
  if (request.last_mile_delivery !== expectedPreferences.lastMileDelivery) {
    issues.push({
      path: 'last_mile_delivery',
      message: `${shipmentMode} shipments require last_mile_delivery=${expectedPreferences.lastMileDelivery}.`,
    });
  }
  if (request.pickup !== expectedPreferences.pickup) {
    issues.push({
      path: 'pickup',
      message: `${shipmentMode} shipments require pickup=${expectedPreferences.pickup}.`,
    });
  }
  if (request.is_insured !== undefined
    && request.is_insured !== '0'
    && request.is_insured !== '1') {
    issues.push({ path: 'is_insured', message: 'Use the string flag "0" or "1".' });
  }
  if (!Array.isArray(request.boxes) || request.boxes.length === 0) {
    issues.push({ path: 'boxes', message: 'Add at least one box.' });
  } else {
    request.boxes.forEach((box, boxIndex) => {
      for (const field of ['index', 'length', 'width', 'height', 'weight'] as const) {
        finiteNumber(box[field], `boxes.${boxIndex}.${field}`, issues);
      }
      if (!Array.isArray(box.items) || box.items.length === 0) {
        issues.push({ path: `boxes.${boxIndex}.items`, message: 'Add at least one item.' });
      } else {
        box.items.forEach((item, itemIndex) => {
          for (const field of [
            'name',
            'description',
            'product_hs_code',
            'country',
          ] as const) {
            requiredString(item[field], `boxes.${boxIndex}.items.${itemIndex}.${field}`, issues);
          }
          if (item.product_hs_code_description !== undefined) {
            requiredString(item.product_hs_code_description, `boxes.${boxIndex}.items.${itemIndex}.product_hs_code_description`, issues);
          }
          if (item.price !== undefined) {
            finiteNumber(item.price, `boxes.${boxIndex}.items.${itemIndex}.price`, issues);
          }
          finiteNumber(item.weight, `boxes.${boxIndex}.items.${itemIndex}.weight`, issues);
          finiteNumber(item.unit_price, `boxes.${boxIndex}.items.${itemIndex}.unit_price`, issues);
          finiteNumber(item.quantity, `boxes.${boxIndex}.items.${itemIndex}.quantity`, issues);
          finiteNumber(item.amount, `boxes.${boxIndex}.items.${itemIndex}.amount`, issues);
        });
      }
    });
  }
  return { valid: issues.length === 0, issues };
}

export function completeRateRequest(draft: ShipmentRateDraft): ShipmentRateRequest {
  return {
    ...structuredClone(draft),
    addresses: structuredClone(draft.addresses) as ShipmentRateRequest['addresses'],
    boxes: draft.boxes.map((box) => ({
      ...box,
      index: Number(box.index),
      length: Number(box.length),
      width: Number(box.width),
      height: Number(box.height),
      weight: Number(box.weight),
      items: box.items.map((item) => {
        const { price, ...fields } = item;
        return {
          ...fields,
          weight: Number(item.weight),
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
          amount: Number(item.amount),
          ...(price === undefined ? {} : { price: Number(price) }),
        };
      }),
    })),
  };
}

export function validatePurchaseRequest(
  request: ShipmentPurchaseRequest,
  shipmentMode: ShipmentMode,
  referenceDate = new Date(),
): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateAddresses(request.address, 'address', issues, 'purchase');
  issues.push(...validateShipmentGeography(shipmentMode, request.address, 'address'));
  issues.push(...validateShipmentUnits(request.units, shipmentMode));
  const expectedCurrency = shipmentMode === 'SFN' ? 'NGN' : 'USD';
  if (request.currency !== expectedCurrency) {
    issues.push({ path: 'currency', message: `${shipmentMode} purchases require ${expectedCurrency}.` });
  }
  validateAssignedDate(request.assigned_date, referenceDate, issues);
  requiredString(request.external_reference, 'external_reference', issues);
  requiredString(request.shipment_method_slug, 'shipment_method_slug', issues);
  if (request.file_is_url !== undefined
    && request.file_is_url !== 0
    && request.file_is_url !== 1) {
    issues.push({ path: 'file_is_url', message: 'Use the numeric flag 0 or 1.' });
  }
  if (request.is_insured !== undefined
    && request.is_insured !== '0'
    && request.is_insured !== '1') {
    issues.push({ path: 'is_insured', message: 'Use the string flag "0" or "1".' });
  }
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
  rate: ShipmentRate;
  type?: string;
  productCode?: 'P' | 'D';
  fileIsUrl?: 0 | 1;
  itemFiles?: Record<string, ItemFileReferences>;
  referenceDate?: Date;
}

export type PurchasePreparationResult =
  | { success: true; request: ShipmentPurchaseRequest }
  | { success: false; issues: ValidationIssue[] };

export function preparePurchaseRequest(
  rateRequest: ShipmentRateRequest,
  options: PurchasePreparationOptions,
): PurchasePreparationResult {
  const issues: ValidationIssue[] = [];
  const shipmentMode: ShipmentMode = rateRequest.units.mass === 'KG' ? 'SFN' : 'STN';
  const expectedCurrency: ShipmentCurrency = shipmentMode === 'SFN' ? 'NGN' : 'USD';
  const rateValidation = validateRateRequest(rateRequest, shipmentMode);
  issues.push(...rateValidation.issues);
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
        ...(item.product_hs_code_description === undefined
          ? {}
          : { product_hs_code_description: item.product_hs_code_description }),
        ...(files?.documents_s3_key === undefined
          ? {}
          : { documents_s3_key: files.documents_s3_key }),
        ...(files?.photos_s3_key === undefined
          ? {}
          : { photos_s3_key: files.photos_s3_key }),
      };
    }),
  }));

  validateAssignedDate(options.assignedDate, options.referenceDate ?? new Date(), issues);
  requiredString(options.externalReference, 'external_reference', issues);
  requiredString(options.rate?.slug, 'rate.slug', issues);
  if (options.rate?.others?.currency !== expectedCurrency) {
    issues.push({
      path: 'rate.others.currency',
      message: `${shipmentMode} rates must use ${expectedCurrency}.`,
    });
  }
  if (typeof options.rate?.mode !== 'string'
    || options.rate.mode.toUpperCase() !== shipmentMode) {
    issues.push({ path: 'rate.mode', message: `Select a ${shipmentMode} rate.` });
  }
  if (options.fileIsUrl !== undefined
    && options.fileIsUrl !== 0
    && options.fileIsUrl !== 1) {
    issues.push({ path: 'file_is_url', message: 'Use the numeric flag 0 or 1.' });
  }
  if (issues.length > 0) return { success: false, issues };

  return {
    success: true,
    request: {
      address: rateRequest.addresses,
      assigned_date: options.assignedDate,
      boxes,
      units: rateRequest.units,
      currency: expectedCurrency,
      external_reference: options.externalReference,
      shipment_method_slug: options.rate.slug,
      ...(rateRequest.is_insured === undefined ? {} : { is_insured: rateRequest.is_insured }),
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.productCode === undefined ? {} : { product_code: options.productCode }),
      ...(options.fileIsUrl === undefined ? {} : { file_is_url: options.fileIsUrl }),
    },
  };
}
