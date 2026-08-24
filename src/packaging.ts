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
  copied.forEach((box, index) => {
    if (![box.length, box.width, box.height, box.weight].every(positive)) issues.push({ path: `boxes.${index}`, message: 'Box dimensions and weight must be positive finite numbers.' });
    if (!box.items.length) issues.push({ path: `boxes.${index}.items`, message: 'Add at least one item.' });
  });
  const contentsWeight = copied.reduce((sum, box) => sum + box.items.reduce((itemSum, item) => itemSum + item.weight * item.quantity, 0), 0);
  const packed = copied.map((rateBox, index): PackedBox => ({
    index: rateBox.index, dimensions: { length: rateBox.length, width: rateBox.width, height: rateBox.height },
    contentsWeight: rateBox.weight, emptyWeight: 0, totalWeight: rateBox.weight,
    usedAdjustedVolume: volume(rateBox), availableVolume: volume(rateBox), utilization: 1,
    items: [], rateBox,
  }));
  return { mode: 'manual', valid: issues.length === 0, boxes: packed, rateBoxes: copied, unpackedItems: [], issues,
    totals: { boxCount: copied.length, itemUnitCount: copied.reduce((n, b) => n + b.items.reduce((m, i) => m + i.quantity, 0), 0), contentsWeight, packagingWeight: 0, totalWeight: copied.reduce((n, b) => n + b.weight, 0), adjustedVolume: copied.reduce((n, b) => n + volume(b), 0) } };
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
  items.forEach((item, itemIndex) => {
    const path = `items.${itemIndex}`;
    const invalid = !item.id.trim() || ids.has(item.id) || !Number.isInteger(item.quantity) || item.quantity <= 0 || !positive(item.unitWeight) || !positive(item.unitPrice) || !Object.values(item.dimensions).every(positive);
    if (ids.has(item.id)) issues.push({ path: `${path}.id`, message: 'Item IDs must be unique.' });
    ids.add(item.id);
    if (invalid) { issues.push({ path, message: 'Item identity, quantity, unit weight, price, and dimensions must be valid positive values.' }); return; }
    if (units.length + item.quantity > limit) { issues.push({ path: `${path}.quantity`, message: `Expanded item count exceeds the safety limit of ${limit}.` }); return; }
    const adjusted = { length: item.dimensions.length + allowance.length, width: item.dimensions.width + allowance.width, height: item.dimensions.height + allowance.height };
    for (let ordinal = 1; ordinal <= item.quantity; ordinal += 1) units.push({ item: structuredClone(item), ordinal, adjusted, volume: volume(adjusted) });
  });
  const catalogIds = new Set<string>();
  const catalog = config.boxCatalog.filter((box) => box.enabled !== false).filter((box, index) => {
    const invalid = !box.id.trim() || catalogIds.has(box.id) || !Object.values(box.innerDimensions).every(positive) || (box.emptyWeight !== undefined && (!Number.isFinite(box.emptyWeight) || box.emptyWeight < 0)) || (box.maxGrossWeight !== undefined && !positive(box.maxGrossWeight));
    if (invalid) issues.push({ path: `boxCatalog.${index}`, message: 'Box IDs must be unique and box measurements must be valid.' });
    catalogIds.add(box.id); return !invalid;
  }).sort((a, b) => volume(a.innerDimensions) - volume(b.innerDimensions) || a.id.localeCompare(b.id));
  if (!catalog.length) issues.push({ path: 'boxCatalog', message: 'Add at least one valid enabled box.' });
  if (issues.length) return { mode: 'automatic', valid: false, boxes: [], rateBoxes: [], unpackedItems, issues, totals: { boxCount: 0, itemUnitCount: units.length, contentsWeight: 0, packagingWeight: 0, totalWeight: 0, adjustedVolume: 0 } };
  units.sort((a, b) => b.volume - a.volume || b.item.unitWeight - a.item.unitWeight || a.item.id.localeCompare(b.item.id) || a.ordinal - b.ordinal);
  const working: WorkingBox[] = [];
  for (const unit of units) {
    let fitted = working.some((box) => place(unit, box, Math.min(config.maxWeightPerBox, box.definition.maxGrossWeight ?? Infinity), config.allowRotation !== false));
    if (!fitted) {
      for (const definition of catalog) {
        const candidate: WorkingBox = { definition, index: working.length + 1, spaces: [{ x: 0, y: 0, z: 0, ...definition.innerDimensions }], units: [], contentsWeight: 0 };
        if (place(unit, candidate, Math.min(config.maxWeightPerBox, definition.maxGrossWeight ?? Infinity), config.allowRotation !== false)) { working.push(candidate); fitted = true; break; }
      }
    }
    if (!fitted) unpackedItems.push({ itemId: unit.item.id, unitOrdinal: unit.ordinal, reason: unit.item.unitWeight > config.maxWeightPerBox ? 'ITEM_TOO_HEAVY' : 'ITEM_TOO_LARGE', message: `Unit ${unit.ordinal} of ${unit.item.name} cannot fit any configured box safely.` });
  }
  const boxes = working.map((box): PackedBox => {
    const grouped = new Map<string, typeof box.units>();
    box.units.forEach((unit) => grouped.set(unit.item.id, [...(grouped.get(unit.item.id) ?? []), unit]));
    const assignments = [...grouped.values()].map((group): PackedItemAssignment => ({ itemId: group[0]!.item.id, itemName: group[0]!.item.name, quantity: group.length, unitWeight: group[0]!.item.unitWeight, adjustedUnitDimensions: group[0]!.adjusted, adjustedUnitVolume: group[0]!.volume, totalWeight: group.length * group[0]!.item.unitWeight, totalAdjustedVolume: group.length * group[0]!.volume, placements: group.map((u) => ({ unitOrdinal: u.ordinal, position: { x: u.position.x, y: u.position.y, z: u.position.z }, dimensions: { length: u.position.length, width: u.position.width, height: u.position.height } })) }));
    const rateItems: RateItem[] = [...grouped.values()].map((group) => { const item = group[0]!.item; return { name: item.name, description: item.description, product_hs_code: item.productHsCode, ...(item.productHsCodeDescription ? { product_hs_code_description: item.productHsCodeDescription } : {}), weight: item.unitWeight, unit_price: item.unitPrice, country: item.country, quantity: group.length, amount: item.amount === undefined ? item.unitPrice * group.length : (item.amount / item.quantity) * group.length }; });
    const emptyWeight = box.definition.emptyWeight ?? 0; const availableVolume = volume(box.definition.innerDimensions); const usedAdjustedVolume = box.units.reduce((n, u) => n + u.volume, 0);
    const rateBox: RateBox = { index: box.index, ...box.definition.innerDimensions, weight: box.contentsWeight + emptyWeight, items: rateItems };
    return { index: box.index, catalogBoxId: box.definition.id, catalogBoxName: box.definition.name, dimensions: box.definition.innerDimensions, contentsWeight: box.contentsWeight, emptyWeight, totalWeight: box.contentsWeight + emptyWeight, usedAdjustedVolume, availableVolume, utilization: usedAdjustedVolume / availableVolume, items: assignments, rateBox };
  });
  const totals = { boxCount: boxes.length, itemUnitCount: units.length, contentsWeight: boxes.reduce((n, b) => n + b.contentsWeight, 0), packagingWeight: boxes.reduce((n, b) => n + b.emptyWeight, 0), totalWeight: boxes.reduce((n, b) => n + b.totalWeight, 0), adjustedVolume: boxes.reduce((n, b) => n + b.usedAdjustedVolume, 0) };
  return { mode: 'automatic', valid: issues.length === 0 && unpackedItems.length === 0, boxes, rateBoxes: boxes.map((b) => b.rateBox), unpackedItems, issues, totals };
}
