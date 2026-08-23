import type { AfricaniesClient } from '../client.js';
import type { RateBoxDraft, RateItemDraft, ShipmentRateDraft, ShipmentRateDraftAddress, ShipmentUnits } from '../types.js';
import { completeRateRequest, validateRateRequest, type ValidationIssue } from '../ui/validation.js';
import { AfricaniesElement, escapeHtml, sharedStyles, testModeMarkup } from './base.js';

const addressFields: Array<[keyof ShipmentRateDraftAddress, string, string]> = [
  ['first_name', 'First name', 'text'],
  ['last_name', 'Last name', 'text'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
  ['alternate_phone', 'Alternate phone', 'tel'],
  ['country', 'Country code', 'text'],
  ['state', 'State code', 'text'],
  ['city', 'City', 'text'],
  ['zip_code', 'Postal code', 'text'],
  ['address', 'Address', 'text'],
  ['address_in_detail', 'Address details', 'text'],
  ['address_landmark', 'Landmark', 'text'],
  ['longitude', 'Longitude', 'number'],
  ['latitude', 'Latitude', 'number'],
];

function emptyAddress(type: 'sender' | 'receiver'): ShipmentRateDraftAddress {
  return {
    first_name: '', last_name: '', email: '', phone: '', country: '', state: '', city: '',
    address: '', address_in_detail: '', address_landmark: null, zip_code: '', type,
    longitude: null, latitude: null, google_address: '0', alternate_phone: null,
    street_number: null, street_name: null,
  };
}

function emptyItem(): RateItemDraft {
  return {
    name: '', description: '', product_hs_code: '',
    weight: '', unit_price: 0, country: '', quantity: '1', amount: '0',
  };
}

function emptyBox(index: number): RateBoxDraft {
  return { index: String(index), length: '', width: '', height: '', weight: '', items: [emptyItem()] };
}

function defaultValue(mode: 'SFN' | 'STN'): ShipmentRateDraft {
  return {
    addresses: { sender: emptyAddress('sender'), receiver: emptyAddress('receiver') },
    boxes: [emptyBox(0)],
    units: unitsForMode(mode),
    last_mile_delivery: mode === 'SFN',
    pickup: mode === 'STN',
    is_insured: '0',
  };
}

function unitsForMode(mode: 'SFN' | 'STN'): ShipmentUnits {
  return mode === 'SFN' ? { dimension: 'cm', mass: 'KG' } : { dimension: 'inches', mass: 'LBS' };
}

function applyModeRules(value: ShipmentRateDraft, mode: 'SFN' | 'STN'): void {
  value.units = unitsForMode(mode);
  value.last_mile_delivery = mode === 'SFN';
  value.pickup = mode === 'STN';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class AfricaniesShipmentBuilderElement extends AfricaniesElement {
  #client: AfricaniesClient | undefined;
  #value: ShipmentRateDraft | undefined;
  #issues: ValidationIssue[] = [];

  get client(): AfricaniesClient | undefined { return this.#client; }
  set client(value: AfricaniesClient | undefined) {
    this.#client = value;
    this.projectClientConfiguration(value);
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'shipment-mode' && oldValue !== newValue && this.#value) {
      applyModeRules(this.#value, this.shipmentMode);
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  get value(): ShipmentRateDraft { return clone(this.#value ?? defaultValue(this.shipmentMode)); }
  set value(value: ShipmentRateDraft) {
    this.#value = clone(value);
    applyModeRules(this.#value, this.shipmentMode);
    this.#value.addresses.sender.type = 'sender';
    this.#value.addresses.receiver.type = 'receiver';
    if (this.isConnected) this.render();
  }

  protected render(): void {
    if (!this.#value) this.#value = defaultValue(this.shipmentMode);
    const value = this.#value;
    this.root.innerHTML = `
      <style>${sharedStyles}
        .section-title { align-items: center; display: flex; justify-content: space-between; }
        .box { border-left: 4px solid var(--africanies-accent); }
        .item { background: var(--africanies-surface); border-radius: 10px; padding: 14px; }
        .issue-list { margin: 0; padding-left: 20px; }
        .field-error { color: var(--africanies-danger); font-size: 12px; font-weight: 650; }
      </style>
      <form class="shell" novalidate>
        <div class="topline"><div><h2>Build your shipment</h2><p class="muted">Sender, receiver, boxes and customs details</p></div>${testModeMarkup(this.environment)}</div>
        ${this.#issues.length ? `<div class="alert error" role="alert"><strong>Please review these fields</strong><ul class="issue-list">${this.#issues.slice(0, 8).map((issue) => `<li>${escapeHtml(issue.path)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul></div>` : ''}
        <div class="stack">
          ${this.renderAddress('sender', value.addresses.sender)}
          ${this.renderAddress('receiver', value.addresses.receiver)}
          <section class="card"><div class="section-title"><div><h3>Packages</h3><p class="muted">Add every box and item being shipped.</p></div><button class="secondary" type="button" data-action="add-box">Add box</button></div><div class="stack">${value.boxes.map((box, index) => this.renderBox(box, index)).join('')}</div></section>
          <section class="card"><h3>Delivery preferences</h3><div class="grid">
            <label>Dimension unit<input value="${escapeHtml(value.units.dimension)}" readonly></label>
            <label>Mass unit<input value="${escapeHtml(value.units.mass)}" readonly></label>
            <label>Last-mile delivery<input value="${value.last_mile_delivery ? 'Enabled' : 'Disabled'}" readonly></label>
            <label>Pickup<input value="${value.pickup ? 'Enabled' : 'Disabled'}" readonly></label>
            <label>Insurance<select data-field="is_insured"><option value="0" ${value.is_insured !== '1' ? 'selected' : ''}>No insurance</option><option value="1" ${value.is_insured === '1' ? 'selected' : ''}>Add insurance</option></select></label>
          </div></section>
        </div>
        <div class="actions"><button type="submit" class="primary">Review rates</button></div>
      </form>`;
    this.bind();
  }

  private renderAddress(role: 'sender' | 'receiver', address: ShipmentRateDraftAddress): string {
    return `<section class="card"><h3>${role === 'sender' ? 'Sender' : 'Receiver'}</h3><div class="grid">${addressFields.map(([key, label, type]) => {
      const path = `addresses.${role}.${String(key)}`;
      return `<label>${label}<input type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} data-path="${path}" data-address="${role}" data-field="${String(key)}" value="${escapeHtml(address[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`;
    }).join('')}<label>Google-derived address<select data-path="addresses.${role}.google_address" data-address="${role}" data-field="google_address" ${this.issueAttributes(`addresses.${role}.google_address`)}><option value="0" ${address.google_address === '0' ? 'selected' : ''}>No</option><option value="1" ${address.google_address === '1' ? 'selected' : ''}>Yes</option></select>${this.issueMarkup(`addresses.${role}.google_address`)}</label></div></section>`;
  }

  private renderBox(box: RateBoxDraft, boxIndex: number): string {
    return `<article class="card box"><div class="section-title"><h3>Box ${boxIndex + 1}</h3><button class="danger" type="button" data-action="remove-box" data-box="${boxIndex}" ${this.#value!.boxes.length === 1 ? 'disabled' : ''}>Remove</button></div>
      <div class="grid">${(['length', 'width', 'height', 'weight'] as const).map((key) => { const path = `boxes.${boxIndex}.${key}`; return `<label>${key[0]!.toUpperCase()}${key.slice(1)}<input inputmode="decimal" data-path="${path}" data-box="${boxIndex}" data-box-field="${key}" value="${escapeHtml(box[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`; }).join('')}</div>
      <div class="section-title" style="margin-top:16px"><h3>Items</h3><button class="secondary" type="button" data-action="add-item" data-box="${boxIndex}">Add item</button></div>
      <div class="stack">${box.items.map((item, itemIndex) => this.renderItem(item, boxIndex, itemIndex)).join('')}</div></article>`;
  }

  private renderItem(item: RateItemDraft, boxIndex: number, itemIndex: number): string {
    const fields: Array<[keyof RateItemDraft, string, string]> = [
      ['name', 'Item name', 'text'], ['description', 'Description', 'text'], ['product_hs_code', 'HS code', 'text'],
      ['product_hs_code_description', 'HS description (optional)', 'text'], ['country', 'Country of origin', 'text'],
      ['weight', 'Weight', 'text'], ['quantity', 'Quantity', 'text'], ['price', 'Price (optional)', 'number'],
      ['unit_price', 'Unit price', 'number'], ['amount', 'Amount', 'text'],
    ];
    return `<div class="item"><div class="section-title"><strong>Item ${itemIndex + 1}</strong><button class="danger" type="button" data-action="remove-item" data-box="${boxIndex}" data-item="${itemIndex}" ${this.#value!.boxes[boxIndex]!.items.length === 1 ? 'disabled' : ''}>Remove</button></div><div class="grid">${fields.map(([key, label, type]) => { const path = `boxes.${boxIndex}.items.${itemIndex}.${String(key)}`; return `<label>${label}<input type="${type}" data-path="${path}" data-box="${boxIndex}" data-item="${itemIndex}" data-item-field="${String(key)}" value="${escapeHtml(item[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`; }).join('')}</div></div>`;
  }

  private bind(): void {
    const form = this.root.querySelector('form')!;
    form.addEventListener('input', (event) => this.handleInput(event));
    form.addEventListener('change', (event) => this.handleInput(event));
    form.addEventListener('click', (event) => this.handleAction(event));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = validateRateRequest(this.#value!, this.shipmentMode);
      this.#issues = result.issues;
      if (!result.valid) {
        this.render();
        this.root.querySelector<HTMLElement>('.alert')?.scrollIntoView?.({ block: 'nearest' });
        const firstIssue = result.issues[0];
        if (firstIssue) {
          const input = [...this.root.querySelectorAll<HTMLElement>('[data-path]')]
            .find((candidate) => candidate.dataset.path === firstIssue.path);
          input?.focus();
        }
        return;
      }
      this.emit('africanies-complete', completeRateRequest(this.#value!));
    });
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const field = input.dataset.field;
    const role = input.dataset.address as 'sender' | 'receiver' | undefined;
    if (role && field) {
      const address = this.#value!.addresses[role] as unknown as Record<string, unknown>;
      address[field] = field === 'longitude' || field === 'latitude'
        ? (input.value === '' ? null : Number(input.value))
        : input.value;
    }
    if (!role && field === 'is_insured') this.#value!.is_insured = input.value as '0' | '1';
    const boxIndex = Number(input.dataset.box);
    if (Number.isInteger(boxIndex) && input.dataset.boxField) {
      (this.#value!.boxes[boxIndex] as unknown as Record<string, unknown>)[input.dataset.boxField] = input.value;
    }
    const itemIndex = Number(input.dataset.item);
    if (Number.isInteger(boxIndex) && Number.isInteger(itemIndex) && input.dataset.itemField) {
      const key = input.dataset.itemField;
      const item = this.#value!.boxes[boxIndex]!.items[itemIndex] as unknown as Record<string, unknown>;
      if ((key === 'price' || key === 'product_hs_code_description') && input.value.trim() === '') {
        delete item[key];
      } else {
        item[key] = input.type === 'number' ? Number(input.value) : input.value;
      }
    }
    this.emit('africanies-change', clone(this.#value!));
  }

  private handleAction(event: Event): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const boxIndex = Number(button.dataset.box);
    if (button.dataset.action === 'add-box') {
      const indexes = this.#value!.boxes.map((box) => Number(box.index)).filter(Number.isFinite);
      const nextIndex = indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
      this.#value!.boxes.push(emptyBox(nextIndex));
    }
    if (button.dataset.action === 'remove-box' && this.#value!.boxes.length > 1) this.#value!.boxes.splice(boxIndex, 1);
    if (button.dataset.action === 'add-item') this.#value!.boxes[boxIndex]!.items.push(emptyItem());
    if (button.dataset.action === 'remove-item' && this.#value!.boxes[boxIndex]!.items.length > 1) this.#value!.boxes[boxIndex]!.items.splice(Number(button.dataset.item), 1);
    this.render();
    this.emit('africanies-change', clone(this.#value!));
  }

  private issueFor(path: string): ValidationIssue | undefined {
    return this.#issues.find((issue) => issue.path === path);
  }

  private issueId(path: string): string {
    return `africanies-error-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private issueAttributes(path: string): string {
    return this.issueFor(path)
      ? `aria-invalid="true" aria-describedby="${this.issueId(path)}"`
      : '';
  }

  private issueMarkup(path: string): string {
    const issue = this.issueFor(path);
    return issue
      ? `<span class="field-error" id="${this.issueId(path)}">${escapeHtml(issue.message)}</span>`
      : '';
  }
}
