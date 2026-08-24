import type { RateBox, RateItem } from './types.js';

export interface Dimensions { length: number; width: number; height: number }
export type PackagingMode = 'automatic' | 'manual';

export interface PackagingCartItem {
  id: string;
  name: string;
  description: string;
  productHsCode: string;
  productHsCodeDescription?: string;
  country: string;
  quantity: number;
  unitWeight: number;
  unitPrice: number;
  amount?: number;
  dimensions: Dimensions;
}

export interface PackagingBoxCatalogEntry {
  id: string;
  name: string;
  innerDimensions: Dimensions;
  emptyWeight?: number;
  maxGrossWeight?: number;
  enabled?: boolean;
}

export interface AutomaticPackagingConfig {
  mode?: 'automatic';
  boxCatalog: readonly PackagingBoxCatalogEntry[];
  dimensionalAllowance?: Partial<Dimensions>;
  maxWeightPerBox: number;
  allowRotation?: boolean;
  maxExpandedUnits?: number;
}

export interface ManualPackagingConfig { mode: 'manual'; boxes: readonly RateBox[] }
export type PackagingConfig = AutomaticPackagingConfig | ManualPackagingConfig;
export interface PackagingIssue { path: string; message: string }
export interface ItemPlacement { unitOrdinal: number; position: { x: number; y: number; z: number }; dimensions: Dimensions }
export interface PackedItemAssignment {
  itemId: string; itemName: string; quantity: number; unitWeight: number;
  adjustedUnitDimensions: Dimensions; adjustedUnitVolume: number;
  totalWeight: number; totalAdjustedVolume: number; placements: ItemPlacement[];
}
export interface PackedBox {
  index: number; catalogBoxId?: string; catalogBoxName?: string; dimensions: Dimensions;
  contentsWeight: number; emptyWeight: number; totalWeight: number;
  usedAdjustedVolume: number; availableVolume: number; utilization: number;
  items: PackedItemAssignment[]; rateBox: RateBox;
}
export interface UnpackedItem { itemId: string; unitOrdinal: number; reason: 'ITEM_TOO_LARGE' | 'ITEM_TOO_HEAVY' | 'NO_BOX_AVAILABLE' | 'INVALID_ITEM'; message: string }
export interface PackagingResult {
  mode: PackagingMode; valid: boolean; boxes: PackedBox[]; rateBoxes: RateBox[];
  unpackedItems: UnpackedItem[]; issues: PackagingIssue[];
  totals: { boxCount: number; itemUnitCount: number; contentsWeight: number; packagingWeight: number; totalWeight: number; adjustedVolume: number };
}

interface Space extends Dimensions { x: number; y: number; z: number }
interface Unit { item: PackagingCartItem; ordinal: number; adjusted: Dimensions; volume: number }
interface WorkingBox { definition: PackagingBoxCatalogEntry; index: number; spaces: Space[]; units: Array<Unit & { position: Space }>; contentsWeight: number }

const volume = (d: Dimensions) => d.length * d.width * d.height;
const positive = (value: number) => Number.isFinite(value) && value > 0;
const orientations = (d: Dimensions, rotate: boolean): Dimensions[] => {
  const values = rotate
    ? [[d.length, d.width, d.height], [d.length, d.height, d.width], [d.width, d.length, d.height], [d.width, d.height, d.length], [d.height, d.length, d.width], [d.height, d.width, d.length]]
    : [[d.length, d.width, d.height]];
  const seen = new Set<string>();
  return values.flatMap(([length, width, height]) => {
    const key = `${length}:${width}:${height}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ length: length!, width: width!, height: height! }];
  });
};

function summarizeManual(boxes: readonly RateBox[]): PackagingResult {
  const copied = structuredClone(boxes) as RateBox[];
  const issues: PackagingIssue[] = [];
  const indexes = new Set<number>();
  if (!copied.length) issues.push({ path: 'boxes', message: 'Add at least one box.' });
  copied.forEach((box, index) => {
    if (![box.length, box.width, box.height, box.weight].every(positive)) issues.push({ path: `boxes.${index}`, message: 'Box dimensions and weight must be positive finite numbers.' });
    if (!Number.isInteger(box.index) || box.index < 0 || indexes.has(box.index)) issues.push({ path: `boxes.${index}.index`, message: 'Box index must be a unique non-negative integer.' });
    indexes.add(box.index);
    if (!Array.isArray(box.items) || !box.items.length) issues.push({ path: `boxes.${index}.items`, message: 'Add at least one item.' });
    (Array.isArray(box.items) ? box.items : []).forEach((item, itemIndex) => {
      const itemPath = `boxes.${index}.items.${itemIndex}`;
      if (![item.name, item.description, item.product_hs_code, item.country].every((value) => typeof value === 'string' && value.trim())) issues.push({ path: itemPath, message: 'Item name, description, HS code, and country are required.' });
      if (!positive(item.weight)) issues.push({ path: `${itemPath}.weight`, message: 'Item weight is unit weight and must be greater than zero.' });
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) issues.push({ path: `${itemPath}.quantity`, message: 'Quantity must be a positive whole number.' });
      if (!Number.isFinite(item.unit_price) || item.unit_price < 0 || !Number.isFinite(item.amount) || item.amount < 0) issues.push({ path: itemPath, message: 'Unit price and amount must be finite non-negative numbers.' });
    });
    const derived = box.items.reduce((sum, item) => sum + item.weight * item.quantity, 0);
    if (Number.isFinite(derived) && box.weight + 1e-9 < derived) issues.push({ path: `boxes.${index}.weight`, message: `Box weight cannot be less than quantity × unit weight totals (${derived}).` });
  });
  const contentsWeight = copied.reduce((sum, box) => sum + box.items.reduce((itemSum, item) => itemSum + item.weight * item.quantity, 0), 0);
  const packed = copied.map((rateBox, index): PackedBox => ({
    index: rateBox.index, dimensions: { length: rateBox.length, width: rateBox.width, height: rateBox.height },
    contentsWeight: rateBox.items.reduce((sum, item) => sum + item.weight * item.quantity, 0),
    emptyWeight: Math.max(0, rateBox.weight - rateBox.items.reduce((sum, item) => sum + item.weight * item.quantity, 0)), totalWeight: rateBox.weight,
    usedAdjustedVolume: volume(rateBox), availableVolume: volume(rateBox), utilization: 1,
    items: [], rateBox,
  }));
  return { mode: 'manual', valid: issues.length === 0, boxes: packed, rateBoxes: copied, unpackedItems: [], issues,
    totals: { boxCount: copied.length, itemUnitCount: copied.reduce((n, b) => n + b.items.reduce((m, i) => m + i.quantity, 0), 0), contentsWeight, packagingWeight: copied.reduce((sum, box) => sum + Math.max(0, box.weight - box.items.reduce((itemSum, item) => itemSum + item.weight * item.quantity, 0)), 0), totalWeight: copied.reduce((n, b) => n + b.weight, 0), adjustedVolume: copied.reduce((n, b) => n + volume(b), 0) } };
}

function place(unit: Unit, box: WorkingBox, maxWeight: number, rotate: boolean): boolean {
  const emptyWeight = box.definition.emptyWeight ?? 0;
  if (box.contentsWeight + emptyWeight + unit.item.unitWeight > maxWeight) return false;
  for (let spaceIndex = 0; spaceIndex < box.spaces.length; spaceIndex += 1) {
    const space = box.spaces[spaceIndex]!;
    const fitting = orientations(unit.adjusted, rotate).filter((d) => d.length <= space.length && d.width <= space.width && d.height <= space.height)
      .sort((a, b) => (volume(space) - volume(a)) - (volume(space) - volume(b)) || a.height - b.height || a.width - b.width || a.length - b.length)[0];
    if (!fitting) continue;
    box.spaces.splice(spaceIndex, 1,
      ...(space.length > fitting.length ? [{ x: space.x + fitting.length, y: space.y, z: space.z, length: space.length - fitting.length, width: space.width, height: space.height }] : []),
      ...(space.width > fitting.width ? [{ x: space.x, y: space.y + fitting.width, z: space.z, length: fitting.length, width: space.width - fitting.width, height: space.height }] : []),
      ...(space.height > fitting.height ? [{ x: space.x, y: space.y, z: space.z + fitting.height, length: fitting.length, width: fitting.width, height: space.height - fitting.height }] : []),
    );
    box.units.push({ ...unit, position: { ...fitting, x: space.x, y: space.y, z: space.z } });
    box.contentsWeight += unit.item.unitWeight;
    return true;
  }
  return false;
}

export function calculatePackaging(items: readonly PackagingCartItem[], config: PackagingConfig): PackagingResult {
  if (config.mode === 'manual') return summarizeManual(config.boxes);
  const issues: PackagingIssue[] = [];
  const unpackedItems: UnpackedItem[] = [];
  const allowance = { length: config.dimensionalAllowance?.length ?? 0, width: config.dimensionalAllowance?.width ?? 0, height: config.dimensionalAllowance?.height ?? 0 };
  if (!positive(config.maxWeightPerBox)) issues.push({ path: 'maxWeightPerBox', message: 'Maximum box weight must be a positive finite number.' });
  for (const [axis, value] of Object.entries(allowance)) if (!Number.isFinite(value) || value < 0) issues.push({ path: `dimensionalAllowance.${axis}`, message: 'Dimensional allowance must be a finite non-negative number.' });
  const ids = new Set<string>();
  const units: Unit[] = [];
  const limit = config.maxExpandedUnits ?? 10_000;
  if (!Number.isInteger(limit) || limit <= 0) issues.push({ path: 'maxExpandedUnits', message: 'Expanded-item safety limit must be a positive integer.' });
  if (!items.length) issues.push({ path: 'items', message: 'Add at least one cart item.' });
  items.forEach((item, itemIndex) => {
    const path = `items.${itemIndex}`;
    const requiredText = [item.id, item.name, item.description, item.productHsCode, item.country];
    const invalid = requiredText.some((value) => typeof value !== 'string' || !value.trim()) || ids.has(item.id) || !Number.isInteger(item.quantity) || item.quantity <= 0 || !positive(item.unitWeight) || !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !Object.values(item.dimensions).every(positive);
    if (ids.has(item.id)) issues.push({ path: `${path}.id`, message: 'Item IDs must be unique.' });
    ids.add(item.id);
    for (const [field, value] of [['id', item.id], ['name', item.name], ['description', item.description], ['productHsCode', item.productHsCode], ['country', item.country]] as const) {
      if (typeof value !== 'string' || !value.trim()) issues.push({ path: `${path}.${field}`, message: 'This field is required.' });
    }
    if (invalid) { issues.push({ path, message: 'Item identity, required shipment fields, quantity, unit weight, price, and dimensions must be valid.' }); return; }
    if (units.length + item.quantity > limit) { issues.push({ path: `${path}.quantity`, message: `Expanded item count exceeds the safety limit of ${limit}.` }); return; }
    const adjusted = { length: item.dimensions.length + allowance.length, width: item.dimensions.width + allowance.width, height: item.dimensions.height + allowance.height };
    for (let ordinal = 1; ordinal <= item.quantity; ordinal += 1) units.push({ item: structuredClone(item), ordinal, adjusted, volume: volume(adjusted) });
  });
  const catalogIds = new Set<string>();
  const catalog = config.boxCatalog.filter((box) => box.enabled !== false).filter((box, index) => {
    const invalid = !box.id.trim() || catalogIds.has(box.id) || !Object.values(box.innerDimensions).every(positive) || (box.emptyWeight !== undefined && (!Number.isFinite(box.emptyWeight) || box.emptyWeight < 0)) || (box.maxGrossWeight !== undefined && !positive(box.maxGrossWeight));
    if (invalid) issues.push({ path: `boxCatalog.${index}`, message: 'Box IDs must be unique and box measurements must be valid.' });
    catalogIds.add(box.id); return !invalid;
  }).sort((a, b) => volume(a.innerDimensions) - volume(b.innerDimensions) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!catalog.length) issues.push({ path: 'boxCatalog', message: 'Add at least one valid enabled box.' });
  if (issues.length) return { mode: 'automatic', valid: false, boxes: [], rateBoxes: [], unpackedItems, issues, totals: { boxCount: 0, itemUnitCount: units.length, contentsWeight: 0, packagingWeight: 0, totalWeight: 0, adjustedVolume: 0 } };
  units.sort((a, b) => b.volume - a.volume || b.item.unitWeight - a.item.unitWeight || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0) || a.ordinal - b.ordinal);
  const working: WorkingBox[] = [];
  for (const unit of units) {
    let fitted = working.some((box) => place(unit, box, Math.min(config.maxWeightPerBox, box.definition.maxGrossWeight ?? Infinity), config.allowRotation !== false));
    if (!fitted) {
      for (const definition of catalog) {
        const candidate: WorkingBox = { definition, index: working.length + 1, spaces: [{ x: 0, y: 0, z: 0, ...definition.innerDimensions }], units: [], contentsWeight: 0 };
        if (place(unit, candidate, Math.min(config.maxWeightPerBox, definition.maxGrossWeight ?? Infinity), config.allowRotation !== false)) { working.push(candidate); fitted = true; break; }
      }
    }
    if (!fitted) {
      const dimensionCandidates = catalog.filter((definition) => orientations(unit.adjusted, config.allowRotation !== false).some((d) => d.length <= definition.innerDimensions.length && d.width <= definition.innerDimensions.width && d.height <= definition.innerDimensions.height));
      const reason = dimensionCandidates.length > 0 && !dimensionCandidates.some((definition) => (definition.emptyWeight ?? 0) + unit.item.unitWeight <= Math.min(config.maxWeightPerBox, definition.maxGrossWeight ?? Infinity)) ? 'ITEM_TOO_HEAVY' : 'ITEM_TOO_LARGE';
      unpackedItems.push({ itemId: unit.item.id, unitOrdinal: unit.ordinal, reason, message: `Unit ${unit.ordinal} of ${unit.item.name} cannot fit any configured box safely because of its ${reason === 'ITEM_TOO_HEAVY' ? 'weight' : 'dimensions'}.` });
    }
  }
  const boxes = working.map((box): PackedBox => {
    const grouped = new Map<string, typeof box.units>();
    box.units.forEach((unit) => grouped.set(unit.item.id, [...(grouped.get(unit.item.id) ?? []), unit]));
    const assignments = [...grouped.values()].map((group): PackedItemAssignment => ({ itemId: group[0]!.item.id, itemName: group[0]!.item.name, quantity: group.length, unitWeight: group[0]!.item.unitWeight, adjustedUnitDimensions: group[0]!.adjusted, adjustedUnitVolume: group[0]!.volume, totalWeight: group.length * group[0]!.item.unitWeight, totalAdjustedVolume: group.length * group[0]!.volume, placements: group.map((u) => ({ unitOrdinal: u.ordinal, position: { x: u.position.x, y: u.position.y, z: u.position.z }, dimensions: { length: u.position.length, width: u.position.width, height: u.position.height } })) }));
    const rateItems: RateItem[] = [...grouped.values()].map((group) => { const item = group[0]!.item; return { name: item.name, description: item.description, product_hs_code: item.productHsCode, ...(item.productHsCodeDescription ? { product_hs_code_description: item.productHsCodeDescription } : {}), weight: item.unitWeight, unit_price: item.unitPrice, country: item.country, quantity: group.length, amount: item.amount === undefined ? item.unitPrice * group.length : (item.amount / item.quantity) * group.length }; });
    const emptyWeight = box.definition.emptyWeight ?? 0; const availableVolume = volume(box.definition.innerDimensions); const usedAdjustedVolume = box.units.reduce((n, u) => n + u.volume, 0);
    const rateBox: RateBox = { index: box.index, ...box.definition.innerDimensions, weight: box.contentsWeight + emptyWeight, items: rateItems };
    return { index: box.index, catalogBoxId: box.definition.id, catalogBoxName: box.definition.name, dimensions: { ...box.definition.innerDimensions }, contentsWeight: box.contentsWeight, emptyWeight, totalWeight: box.contentsWeight + emptyWeight, usedAdjustedVolume, availableVolume, utilization: usedAdjustedVolume / availableVolume, items: assignments, rateBox };
  });
  const totals = { boxCount: boxes.length, itemUnitCount: units.length, contentsWeight: boxes.reduce((n, b) => n + b.contentsWeight, 0), packagingWeight: boxes.reduce((n, b) => n + b.emptyWeight, 0), totalWeight: boxes.reduce((n, b) => n + b.totalWeight, 0), adjustedVolume: boxes.reduce((n, b) => n + b.usedAdjustedVolume, 0) };
  return { mode: 'automatic', valid: issues.length === 0 && unpackedItems.length === 0, boxes, rateBoxes: boxes.map((b) => b.rateBox), unpackedItems, issues, totals };
}
