import type { AfricaniesClient } from '../client.js';
import type { ProductHsCode, RateBoxDraft, RateItemDraft, ShipmentRateDraft, ShipmentRateDraftAddress, ShipmentUnits } from '../types.js';
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
  #step = 0;
  #productResults = new Map<string, ProductHsCode[]>();
  #productStatus = new Map<string, string>();
  #productSearches = new Map<string, { version: number; controller: AbortController }>();
  #productQueries = new Map<string, string>();
  #productDebounces = new Map<string, number>();
  #productOpen = new Set<string>();
  #productActive = new Map<string, number>();

  get client(): AfricaniesClient | undefined { return this.#client; }
  set client(value: AfricaniesClient | undefined) {
    this.cancelProductSearches();
    this.#client = value;
    this.projectClientConfiguration(value);
  }

  disconnectedCallback(): void {
    this.cancelProductSearches();
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
        .box { border:1px solid var(--africanies-border); border-top:3px solid var(--africanies-mode); }
        .item { background: var(--africanies-surface); border-radius: 10px; padding: 14px; }
        .issue-list { margin: 0; padding-left: 20px; }
        .field-error { color: var(--africanies-danger); font-size: 12px; font-weight: 650; }
        .panel-heading { margin-bottom:20px; }
        .summary-pair { display:grid; gap:16px; grid-template-columns:repeat(2,minmax(0,1fr)); }
        .summary-value { font-size:14px; margin:5px 0 0; }
        .combobox { position:relative; }
        .combobox-results { background:#fff; border:1px solid var(--africanies-border); border-radius:10px; box-shadow:0 12px 28px #17243a20; list-style:none; margin:4px 0 0; max-height:220px; overflow:auto; padding:5px; position:absolute; width:100%; z-index:4; }
        .combobox-results li { border-radius:7px; cursor:pointer; display:grid; gap:2px; padding:9px 10px; }
        .combobox-results li[aria-selected="true"] { background:#e7f8ee; }
        .combobox-results small { color:var(--africanies-muted); }
        .selected-product { align-items:center; background:#edf8f1; border-radius:8px; display:flex; gap:8px; justify-content:space-between; margin-top:8px; padding:9px; }
        @media(max-width:640px){.summary-pair{grid-template-columns:1fr}}
      </style><form class="shell" novalidate>
        <div class="topline"><div><h2>Create shipment</h2><p class="muted">Complete each section, review the shipment, then request rates.</p></div>${testModeMarkup(this.environment)}</div>
        ${this.renderWorkflow()}
        ${this.#issues.length ? `<div class="alert error" role="alert"><strong>Please review these fields</strong><ul class="issue-list">${this.#issues.slice(0, 8).map((issue) => `<li>${escapeHtml(issue.path)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul></div>` : ''}
        <div class="stack" data-stage="${this.#step}">
          ${this.#step === 0 ? `<section class="card"><div class="panel-heading"><h3>Drop-off method</h3><p class="muted">Delivery behavior is determined by the ${this.shipmentMode} API contract.</p></div><div class="grid">
            <label>Dimension unit<input value="${escapeHtml(value.units.dimension)}" readonly></label>
            <label>Mass unit<input value="${escapeHtml(value.units.mass)}" readonly></label>
            <label>Last-mile delivery<input value="${value.last_mile_delivery ? 'Enabled' : 'Disabled'}" readonly></label>
            <label>Pickup<input value="${value.pickup ? 'Enabled' : 'Disabled'}" readonly></label>
            <label>Insurance<select data-field="is_insured"><option value="0" ${value.is_insured !== '1' ? 'selected' : ''}>No insurance</option><option value="1" ${value.is_insured === '1' ? 'selected' : ''}>Add insurance</option></select></label>
          </div></section>` : ''}
          ${this.#step === 1 ? this.renderAddress('sender', value.addresses.sender) : ''}
          ${this.#step === 2 ? this.renderAddress('receiver', value.addresses.receiver) : ''}
          ${this.#step === 3 ? `<section class="card"><div class="section-title"><div><h3>What are you shipping?</h3><p class="muted">Item weight is unit weight. Africanies calculates each line as quantity × unit weight.</p></div><button class="secondary" type="button" data-action="add-box">Add new box</button></div><div class="stack">${value.boxes.map((box, index) => this.renderBox(box, index)).join('')}</div></section>` : ''}
          ${this.#step === 4 ? this.renderSummary(value) : ''}
        </div>
        <div class="actions">${this.#step > 0 ? '<button type="button" class="secondary" data-action="previous-step">Back</button>' : ''}${this.#step < 4 ? '<button type="button" class="primary" data-action="next-step">Continue</button>' : '<button type="submit" class="primary">Create shipment &amp; review rates</button>'}</div>
      </form>`;
    this.bind();
  }

  private renderWorkflow(): string {
    return `<nav class="workflow" aria-label="Shipment creation progress">${['Drop-off', 'Sender', 'Receiver', 'Items', 'Summary'].map((label, index) => `<div class="workflow-step ${index < this.#step ? 'done' : index === this.#step ? 'active' : ''}" ${index === this.#step ? 'aria-current="step"' : ''}><span>${index < this.#step ? '✓' : index + 1}</span><b>${label}</b></div>`).join('')}</nav>`;
  }

  private renderSummary(value: ShipmentRateDraft): string {
    const itemCount = value.boxes.reduce((sum, box) => sum + box.items.reduce((count, item) => count + Number(item.quantity || 0), 0), 0);
    return `<section class="card stack"><div><h3>Shipment summary</h3><p class="muted">Review the shipment details before loading carriers.</p></div><div class="summary-pair"><article class="card"><strong>Sender</strong><p class="summary-value">${escapeHtml(value.addresses.sender.first_name)} ${escapeHtml(value.addresses.sender.last_name)}<br>${escapeHtml(value.addresses.sender.address)}, ${escapeHtml(value.addresses.sender.city)}<br>${escapeHtml(value.addresses.sender.country)}</p></article><article class="card"><strong>Receiver</strong><p class="summary-value">${escapeHtml(value.addresses.receiver.first_name)} ${escapeHtml(value.addresses.receiver.last_name)}<br>${escapeHtml(value.addresses.receiver.address)}, ${escapeHtml(value.addresses.receiver.city)}<br>${escapeHtml(value.addresses.receiver.country)}</p></article></div><details class="card" open><summary><strong>${value.boxes.length} box${value.boxes.length === 1 ? '' : 'es'} · ${itemCount} item${itemCount === 1 ? '' : 's'}</strong></summary>${value.boxes.map((box, index) => `<p>Box ${index + 1}: ${escapeHtml(box.length)} × ${escapeHtml(box.width)} × ${escapeHtml(box.height)} ${escapeHtml(value.units.dimension)} · ${escapeHtml(box.weight)} ${escapeHtml(value.units.mass)}</p>`).join('')}</details></section>`;
  }

  private renderAddress(role: 'sender' | 'receiver', address: ShipmentRateDraftAddress): string {
    return `<section class="card"><h3>${role === 'sender' ? 'Sender' : 'Receiver'}</h3><div class="grid">${addressFields.map(([key, label, type]) => {
      const path = `addresses.${role}.${String(key)}`;
      return `<label>${label}<input type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} data-path="${path}" data-address="${role}" data-field="${String(key)}" value="${escapeHtml(address[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`;
    }).join('')}<label>Google-derived address<select data-path="addresses.${role}.google_address" data-address="${role}" data-field="google_address" ${this.issueAttributes(`addresses.${role}.google_address`)}><option value="0" ${address.google_address === '0' ? 'selected' : ''}>No</option><option value="1" ${address.google_address === '1' ? 'selected' : ''}>Yes</option></select>${this.issueMarkup(`addresses.${role}.google_address`)}</label></div></section>`;
  }

  private renderBox(box: RateBoxDraft, boxIndex: number): string {
    const contentsWeight = box.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.weight || 0), 0);
    return `<article class="card box"><div class="section-title"><h3>Box ${boxIndex + 1}</h3><button class="danger" type="button" data-action="remove-box" data-box="${boxIndex}" ${this.#value!.boxes.length === 1 ? 'disabled' : ''}>Remove</button></div>
      <p class="muted">Stable API index ${escapeHtml(box.index)}. Enter gross weight including contents and any box/tare weight; current item quantity × unit-weight total is ${escapeHtml(contentsWeight.toFixed(2))} ${escapeHtml(this.#value!.units.mass)}.</p>
      <div class="grid">${(['length', 'width', 'height', 'weight'] as const).map((key) => { const path = `boxes.${boxIndex}.${key}`; const label=key==='weight'?'Gross weight (contents + tare)':key[0]!.toUpperCase()+key.slice(1); return `<label>${label}<input inputmode="decimal" data-path="${path}" data-box="${boxIndex}" data-box-field="${key}" value="${escapeHtml(box[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`; }).join('')}</div>
      <div class="section-title" style="margin-top:16px"><h3>Items</h3><button class="secondary" type="button" data-action="add-item" data-box="${boxIndex}">Add item</button></div>
      <div class="stack">${box.items.map((item, itemIndex) => this.renderItem(item, boxIndex, itemIndex)).join('')}</div></article>`;
  }

  private renderItem(item: RateItemDraft, boxIndex: number, itemIndex: number): string {
    const fields: Array<[keyof RateItemDraft, string, string]> = [
      ['name', 'Item name', 'text'], ['description', 'Description', 'text'], ['country', 'Country of origin', 'text'],
      ['weight', 'Unit weight', 'text'], ['quantity', 'Quantity', 'text'], ['price', 'Price (optional)', 'number'],
      ['unit_price', 'Unit price', 'number'], ['amount', 'Amount', 'text'],
    ];
    const resultKey = `${boxIndex}:${itemIndex}`;
    const results = this.#productResults.get(resultKey) ?? [];
    const listId = `product-list-${boxIndex}-${itemIndex}`; const active = this.#productActive.get(resultKey) ?? -1;
    return `<div class="item"><div class="section-title"><strong>Item ${itemIndex + 1}</strong><button class="danger" type="button" data-action="remove-item" data-box="${boxIndex}" data-item="${itemIndex}" ${this.#value!.boxes[boxIndex]!.items.length === 1 ? 'disabled' : ''}>Remove</button></div><div class="grid">${fields.map(([key, label, type]) => { const path = `boxes.${boxIndex}.items.${itemIndex}.${String(key)}`; return `<label>${label}<input type="${type}" data-path="${path}" data-box="${boxIndex}" data-item="${itemIndex}" data-item-field="${String(key)}" value="${escapeHtml(item[key])}" ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`; }).join('')}<div class="combobox"><label>Find closest product<input role="combobox" aria-autocomplete="list" aria-expanded="${this.#productOpen.has(resultKey)}" aria-controls="${listId}" ${active >= 0 ? `aria-activedescendant="${listId}-option-${active}"` : ''} data-product-query data-box="${boxIndex}" data-item="${itemIndex}" autocomplete="off" value="${escapeHtml(this.#productQueries.get(resultKey) ?? item.product_hs_code_description ?? item.name)}"></label><ul id="${listId}" class="combobox-results" role="listbox" ${this.#productOpen.has(resultKey) ? '' : 'hidden'}>${results.map((product, index) => `<li id="${listId}-option-${index}" role="option" aria-selected="${index === active}" data-product-option data-box="${boxIndex}" data-item="${itemIndex}" data-index="${index}" data-hs="${escapeHtml(product.hs_code)}" data-name="${escapeHtml(product.name)}"><strong>${escapeHtml(product.name)}</strong><small>HS ${escapeHtml(product.hs_code)}</small></li>`).join('')}</ul>${item.product_hs_code ? `<div class="selected-product"><span>${escapeHtml(item.product_hs_code_description ?? 'Selected product')} · HS ${escapeHtml(item.product_hs_code)}</span><button class="secondary" type="button" data-action="clear-product" data-box="${boxIndex}" data-item="${itemIndex}">Clear</button></div>` : ''}<p class="muted" role="status" aria-live="polite">${escapeHtml(this.#productStatus.get(resultKey) ?? 'Type at least 3 characters; search starts automatically.')}</p></div></div></div>`;
  }

  private bind(): void {
    const form = this.root.querySelector('form')!;
    form.addEventListener('input', (event) => this.handleInput(event));
    form.addEventListener('change', (event) => this.handleInput(event));
    form.addEventListener('click', (event) => this.handleAction(event));
    form.addEventListener('keydown', (event) => this.handleProductKeydown(event as KeyboardEvent));
    form.querySelector('[data-action="next-step"]')?.addEventListener('click', () => { this.#step = Math.min(4, this.#step + 1); this.render(); });
    form.querySelector('[data-action="previous-step"]')?.addEventListener('click', () => { this.#step = Math.max(0, this.#step - 1); this.render(); });
    form.querySelectorAll<HTMLButtonElement>('[data-action="search-product"]').forEach((button) => button.addEventListener('click', () => void this.searchProducts(Number(button.dataset.box), Number(button.dataset.item))));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = validateRateRequest(this.#value!, this.shipmentMode);
      this.#issues = result.issues;
      if (!result.valid) {
        const firstPath = result.issues[0]?.path ?? '';
        this.#step = firstPath.startsWith('addresses.sender') ? 1
          : firstPath.startsWith('addresses.receiver') ? 2
            : firstPath.startsWith('boxes') ? 3 : this.#step;
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
    if (input.matches('[data-product-query]')) {
      const boxIndex = Number(input.dataset.box); const itemIndex = Number(input.dataset.item); const key = `${boxIndex}:${itemIndex}`;
      this.#productQueries.set(key, input.value); this.#productSearches.get(key)?.controller.abort(); this.#productSearches.delete(key);
      const pending = this.#productDebounces.get(key); if (pending !== undefined) clearTimeout(pending);
      const item = this.#value!.boxes[boxIndex]!.items[itemIndex]!; item.product_hs_code = ''; delete item.product_hs_code_description; this.#productResults.delete(key);
      this.#productOpen.delete(key); this.#productActive.delete(key); input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); const combobox=input.closest('.combobox'); combobox?.querySelector('.selected-product')?.remove(); combobox?.querySelector<HTMLElement>('[role="listbox"]')?.setAttribute('hidden','');
      this.emit('africanies-change', clone(this.#value!));
      if (input.value.trim().length < 3) { this.#productStatus.set(key, 'Type at least 3 characters to search.'); this.#productDebounces.delete(key); return; }
      this.#productStatus.set(key, 'Waiting to search…');
      this.#productDebounces.set(key, window.setTimeout(() => { this.#productDebounces.delete(key); void this.searchProducts(boxIndex, itemIndex); }, 350));
      return;
    }
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

  private async searchProducts(boxIndex: number, itemIndex: number): Promise<void> {
    if (!this.#client) return;
    const client = this.#client;
    const query = (this.#productQueries.get(`${boxIndex}:${itemIndex}`) ?? this.root.querySelector<HTMLInputElement>(`[data-product-query][data-box="${boxIndex}"][data-item="${itemIndex}"]`)?.value ?? '').trim();
    const key = `${boxIndex}:${itemIndex}`; const item = this.#value!.boxes[boxIndex]!.items[itemIndex]!;
    const pending = this.#productDebounces.get(key); if (pending !== undefined) clearTimeout(pending); this.#productDebounces.delete(key);
    this.#productSearches.get(key)?.controller.abort();
    const search = { version: (this.#productSearches.get(key)?.version ?? 0) + 1, controller: new AbortController() };
    this.#productSearches.set(key, search);
    item.product_hs_code = ''; delete item.product_hs_code_description; this.#productResults.delete(key);
    if (query.length < 3) { this.#productSearches.delete(key); this.#productStatus.set(key, 'Type at least 3 characters to search.'); this.render(); return; }
    this.#productStatus.set(key, 'Searching products…'); this.render();
    try {
      const response = await client.products.search(query, search.controller.signal);
      if (this.#productSearches.get(key) !== search || client !== this.#client || !this.isConnected) return;
      const results = Array.isArray(response.data) ? response.data : [];
      this.#productResults.set(key, results); this.#productStatus.set(key, results.length ? `${results.length} products found. Select the closest match.` : 'No matching products found.');
      if (results.length) { this.#productOpen.add(key); this.#productActive.set(key, 0); }
    } catch (cause) {
      if (this.#productSearches.get(key) !== search || client !== this.#client || !this.isConnected || search.controller.signal.aborted) return;
      this.#productStatus.set(key, cause instanceof Error ? cause.message : 'Product search failed.');
    }
    if (this.#productSearches.get(key) === search) this.#productSearches.delete(key);
    this.render();
  }

  private cancelProductSearches(): void {
    for (const search of this.#productSearches.values()) search.controller.abort();
    this.#productSearches.clear();
    for (const timer of this.#productDebounces.values()) clearTimeout(timer);
    this.#productDebounces.clear();
  }

  private clearProductInteractionState(): void {
    this.cancelProductSearches();
    this.#productQueries.clear(); this.#productResults.clear(); this.#productStatus.clear();
    this.#productOpen.clear(); this.#productActive.clear();
  }

  private handleAction(event: Event): void {
    const option = (event.target as Element).closest<HTMLElement>('[data-product-option]');
    if (option) { this.selectProduct(Number(option.dataset.box), Number(option.dataset.item), Number(option.dataset.index)); return; }
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button) return;
    const boxIndex = Number(button.dataset.box);
    let changed = false;
    if (button.dataset.action === 'add-box') {
      const indexes = this.#value!.boxes.map((box) => Number(box.index)).filter(Number.isFinite);
      const nextIndex = indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
      this.#value!.boxes.push(emptyBox(nextIndex));
      changed = true;
    }
    if (button.dataset.action === 'remove-box' && this.#value!.boxes.length > 1) { this.#value!.boxes.splice(boxIndex, 1); this.clearProductInteractionState(); changed = true; }
    if (button.dataset.action === 'add-item') { this.#value!.boxes[boxIndex]!.items.push(emptyItem()); changed = true; }
    if (button.dataset.action === 'remove-item' && this.#value!.boxes[boxIndex]!.items.length > 1) { this.#value!.boxes[boxIndex]!.items.splice(Number(button.dataset.item), 1); this.clearProductInteractionState(); changed = true; }
    if (button.dataset.action === 'clear-product') { const itemIndex=Number(button.dataset.item); const key=`${boxIndex}:${itemIndex}`; this.#productSearches.get(key)?.controller.abort(); this.#productSearches.delete(key); const pending=this.#productDebounces.get(key); if(pending!==undefined)clearTimeout(pending); this.#productDebounces.delete(key); const item=this.#value!.boxes[boxIndex]!.items[itemIndex]!; item.product_hs_code=''; delete item.product_hs_code_description; this.#productQueries.set(key,''); this.#productResults.delete(key); this.#productOpen.delete(key); this.#productActive.delete(key); changed=true; }
    if (!changed) return;
    this.render();
    this.emit('africanies-change', clone(this.#value!));
  }

  private selectProduct(boxIndex:number,itemIndex:number,index:number):void { const key=`${boxIndex}:${itemIndex}`; const product=this.#productResults.get(key)?.[index]; if(!product)return; const item=this.#value!.boxes[boxIndex]!.items[itemIndex]!; item.product_hs_code=product.hs_code; item.product_hs_code_description=product.name; this.#productQueries.set(key,product.name); this.#productOpen.delete(key); this.#productStatus.set(key,`${product.name} · HS ${product.hs_code}`); this.emit('africanies-change',clone(this.#value!)); this.render(); }

  private handleProductKeydown(event:KeyboardEvent):void { const input=(event.target as Element).closest<HTMLInputElement>('[data-product-query]'); if(!input)return; const box=Number(input.dataset.box), item=Number(input.dataset.item), key=`${box}:${item}`; const results=this.#productResults.get(key)??[]; if(event.key==='Escape'){this.#productOpen.delete(key);input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');this.root.querySelector<HTMLElement>(`#product-list-${box}-${item}`)?.setAttribute('hidden','');return;} if(!results.length)return; let active=this.#productActive.get(key)??0; if(event.key==='ArrowDown'){event.preventDefault();active=(active+1)%results.length;} else if(event.key==='ArrowUp'){event.preventDefault();active=(active-1+results.length)%results.length;} else if(event.key==='Enter'&&this.#productOpen.has(key)){event.preventDefault();this.selectProduct(box,item,active);return;} else return; this.#productActive.set(key,active);this.#productOpen.add(key);this.render();this.root.querySelector<HTMLInputElement>(`[data-product-query][data-box="${box}"][data-item="${item}"]`)?.focus(); }

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
