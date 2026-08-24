import type { AfricaniesClient } from '../client.js';
import type { ProductHsCode, RateBoxDraft, RateItemDraft, ShipmentRateDraft, ShipmentRateDraftAddress, ShipmentUnits } from '../types.js';
import { completeRateRequest, validateRateRequest, type ValidationIssue } from '../ui/validation.js';
import { inferShipmentMode } from '../shipment-validation.js';
import { AfricaniesElement, escapeHtml, sharedStyles, testModeMarkup } from './base.js';

const addressFields: Array<[keyof ShipmentRateDraftAddress, string, string]> = [
  ['first_name', 'First name', 'text'],
  ['last_name', 'Last name', 'text'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
  ['alternate_phone', 'Alternate phone', 'tel'],
  ['city', 'City', 'text'],
  ['zip_code', 'Postal code', 'text'],
  ['address', 'Address', 'text'],
  ['address_in_detail', 'Address details', 'text'],
  ['address_landmark', 'Landmark', 'text'],
];

export interface AfricaniesLocationOption { code: string; name: string }
export interface AfricaniesCountryOption extends AfricaniesLocationOption { states?: AfricaniesLocationOption[] }
export interface AfricaniesPlaceSelection {
  address: string; city?: string; state?: string; country?: string; zipCode?: string;
  streetNumber?: string | null; streetName?: string | null; latitude?: number; longitude?: number;
}
export interface AfricaniesPlacesProvider {
  attach(input: HTMLInputElement, select: (place: AfricaniesPlaceSelection) => void): void | (() => void);
}
export interface AfricaniesShipmentBuilderConfig {
  countries?: AfricaniesCountryOption[];
  loadCountries?: () => Promise<AfricaniesCountryOption[]>;
  retainCoordinatesOnManualEdit?: boolean;
  googlePlaces?: {
    apiKey?: string;
    provider?: AfricaniesPlacesProvider;
    loader?: (apiKey?: string) => Promise<AfricaniesPlacesProvider>;
  };
}

const defaultCountries: AfricaniesCountryOption[] = [
  { code: 'NG', name: 'Nigeria', states: [{ code: 'LA', name: 'Lagos' }, { code: 'FC', name: 'Federal Capital Territory' }] },
  { code: 'US', name: 'United States', states: [{ code: 'MA', name: 'Massachusetts' }, { code: 'DE', name: 'Delaware' }] },
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
  #config: AfricaniesShipmentBuilderConfig = {};
  #countries: AfricaniesCountryOption[] = defaultCountries;
  #locationsStatus = '';
  #placesStatus = '';
  #placesCleanup: Array<() => void> = [];
  #placesProvider: AfricaniesPlacesProvider | undefined;
  #placesLoading: Promise<AfricaniesPlacesProvider> | undefined;
  #editor: { kind: 'box'; box: number; added: boolean; returnAction: string; draft: RateBoxDraft; error?: string; errorField?: string }
    | { kind: 'item'; box: number; item: number; added: boolean; returnAction: string; draft: RateItemDraft; error?: string; errorField?: string }
    | undefined;

  get config(): AfricaniesShipmentBuilderConfig { return this.#config; }
  set config(value: AfricaniesShipmentBuilderConfig) {
    this.#config = value ?? {};
    this.#placesProvider = value.googlePlaces?.provider; this.#placesLoading = undefined;
    if (value.countries) this.#countries = clone(value.countries);
    if (value.loadCountries) void this.loadCountries(value.loadCountries);
    if (this.isConnected) this.render();
  }

  get client(): AfricaniesClient | undefined { return this.#client; }
  set client(value: AfricaniesClient | undefined) {
    this.cancelProductSearches();
    this.#client = value;
    if (this.#value) applyModeRules(this.#value, this.effectiveMode());
    this.projectClientConfiguration(value);
  }

  disconnectedCallback(): void {
    this.cancelProductSearches();
    this.cleanupPlaces();
  }

  override attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (name === 'shipment-mode' && oldValue !== newValue && this.#value) {
      applyModeRules(this.#value, this.effectiveMode());
    }
    super.attributeChangedCallback(name, oldValue, newValue);
  }

  get value(): ShipmentRateDraft { return clone(this.#value ?? defaultValue(this.legacyMode() ?? 'SFN')); }
  set value(value: ShipmentRateDraft) {
    this.#value = clone(value);
    applyModeRules(this.#value, this.effectiveMode());
    this.#value.is_insured = this.#value.is_insured === '1' ? '1' : '0';
    this.#value.addresses.sender.type = 'sender';
    this.#value.addresses.receiver.type = 'receiver';
    if (this.isConnected) this.render();
  }

  protected render(): void {
    if (!this.#value) this.#value = defaultValue(this.legacyMode() ?? 'SFN');
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
        .address-toggle { align-items:center; display:flex; gap:8px; }
        .address-toggle input { min-height:22px; width:22px; }
        .summary-list { display:grid; gap:6px; margin:12px 0 0; }
        .summary-list div { display:flex; gap:12px; justify-content:space-between; }
        .summary-list dt { color:var(--africanies-muted); }
        .summary-list dd { margin:0; text-align:right; }
        .item-table { border-collapse:collapse; margin-top:12px; width:100%; }
        .item-table caption { font-weight:750; padding:8px; text-align:left; }
        .item-table th,.item-table td { border-bottom:1px solid var(--africanies-border); padding:10px; text-align:left; }
        dialog { background:transparent; border:0; inset:0; margin:auto; max-height:92vh; max-width:min(760px,calc(100% - 24px)); overflow:auto; padding:0; width:100%; }
        dialog::backdrop { background:#17243ab8; }
        @media(max-width:640px){.summary-pair{grid-template-columns:1fr}.item-table{display:block;overflow:auto}}
      </style><form class="shell" novalidate>
        <div class="topline"><div><h2>Create shipment</h2><p class="muted">Complete each section, review the shipment, then request rates.</p></div>${testModeMarkup(this.environment)}</div>
        ${this.renderWorkflow()}
        ${this.#issues.length ? `<div class="alert error" role="alert"><strong>Please review these fields</strong><ul class="issue-list">${this.#issues.slice(0, 8).map((issue) => `<li>${escapeHtml(issue.path)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul></div>` : ''}
        <div class="stack" data-stage="${this.#step}">
          ${this.effectiveMode() === 'STN' && this.#step === 0 ? `<section class="card"><div class="panel-heading"><h3>Drop-off method</h3><p class="muted">Delivery behavior is determined by the STN API contract.</p></div><div class="grid">
            <label>Dimension unit<input value="${escapeHtml(value.units.dimension)}" readonly></label>
            <label>Mass unit<input value="${escapeHtml(value.units.mass)}" readonly></label>
            <label>Last-mile delivery<input value="${value.last_mile_delivery ? 'Enabled' : 'Disabled'}" readonly></label>
            <label>Pickup<input value="${value.pickup ? 'Enabled' : 'Disabled'}" readonly></label>
          </div></section>` : ''}
          ${this.#step === this.stepIndex('sender') ? this.renderAddress('sender', value.addresses.sender) : ''}
          ${this.#step === this.stepIndex('receiver') ? this.renderAddress('receiver', value.addresses.receiver) : ''}
          ${this.#step === this.stepIndex('items') ? `<section class="card"><div class="section-title"><div><h3>What are you shipping?</h3><p class="muted">Item weight is unit weight. Africanies calculates each line as quantity × unit weight.</p></div><button class="secondary" type="button" data-action="add-box">Add new box</button></div><div class="stack">${value.boxes.map((box, index) => this.renderBox(box, index)).join('')}</div></section>` : ''}
          ${this.#step === this.stepIndex('summary') ? this.renderSummary(value) : ''}
        </div>
        <div class="actions">${this.#step > 0 ? '<button type="button" class="secondary" data-action="previous-step">Back</button>' : ''}${this.#step < this.lastStep ? '<button type="button" class="primary" data-action="next-step">Continue</button>' : '<button type="submit" class="primary">Create shipment &amp; review rates</button>'}</div>
        ${this.renderEditor()}
      </form>`;
    this.bind();
    if (this.#editor) queueMicrotask(()=>{const dialog=this.root.querySelector<HTMLDialogElement>('dialog');if(dialog&&!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}this.root.querySelector<HTMLInputElement>('[data-editor-initial="true"], dialog input, dialog button')?.focus();});
  }

  private renderWorkflow(): string {
    const labels = this.effectiveMode() === 'STN' ? ['Drop-off', 'Sender', 'Receiver', 'Items', 'Summary'] : ['Sender', 'Receiver', 'Items', 'Summary'];
    return `<nav class="workflow" style="grid-template-columns:repeat(${labels.length},1fr)" aria-label="Shipment creation progress">${labels.map((label, index) => `<div class="workflow-step ${index < this.#step ? 'done' : index === this.#step ? 'active' : ''}" ${index === this.#step ? 'aria-current="step"' : ''}><span>${index < this.#step ? '✓' : index + 1}</span><b>${label}</b></div>`).join('')}</nav>`;
  }

  private get lastStep(): number { return this.effectiveMode() === 'STN' ? 4 : 3; }
  private stepIndex(step: 'sender' | 'receiver' | 'items' | 'summary'): number {
    const offset = this.effectiveMode() === 'STN' ? 1 : 0;
    return ({ sender: 0, receiver: 1, items: 2, summary: 3 } as const)[step] + offset;
  }

  private renderSummary(value: ShipmentRateDraft): string {
    const itemCount = value.boxes.reduce((sum, box) => sum + box.items.reduce((count, item) => count + Number(item.quantity || 0), 0), 0);
    const addressCard = (role: 'sender' | 'receiver', title: string) => { const address=value.addresses[role]; return `<article class="card"><div class="section-title"><strong>${title}</strong><button class="secondary" type="button" data-action="edit-step" data-step="${this.stepIndex(role)}">Edit</button></div><dl class="summary-list"><div><dt>Full name</dt><dd>${escapeHtml(address.first_name)} ${escapeHtml(address.last_name)}</dd></div><div><dt>Email</dt><dd>${escapeHtml(address.email)}</dd></div><div><dt>Phone</dt><dd>${escapeHtml(address.phone)}</dd></div><div><dt>Address</dt><dd>${escapeHtml(address.address)}</dd></div><div><dt>City / State</dt><dd>${escapeHtml(address.city)} / ${escapeHtml(address.state)}</dd></div><div><dt>Country</dt><dd>${escapeHtml(address.country)}</dd></div></dl></article>`; };
    return `<section class="stack"><section class="card stack"><div><h3>Shipment summary</h3><p class="muted">Review the shipment details before loading carriers.</p></div><div class="summary-pair">${addressCard('sender','Ship From (Sender)')}${addressCard('receiver','Ship To (Receiver)')}</div></section><section class="card"><div class="section-title"><h3>Boxes</h3><button class="secondary" type="button" data-action="edit-step" data-step="${this.stepIndex('items')}">Edit</button></div>${value.boxes.map((box,index)=>{const total=box.items.reduce((sum,item)=>sum+Number(item.unit_price??item.price??0)*Number(item.quantity||0),0);return `<details class="card" open><summary><strong>Box ${index+1}</strong> · ${escapeHtml(box.length)} × ${escapeHtml(box.width)} × ${escapeHtml(box.height)} ${escapeHtml(value.units.dimension)} · ${escapeHtml(box.weight)} ${escapeHtml(value.units.mass)}</summary><table class="item-table"><caption>Items in Box ${index+1}</caption><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit value</th><th scope="col">Total</th></tr></thead><tbody>${box.items.map(item=>{const unit=Number(item.unit_price??item.price??0);return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(unit)}</td><td>${escapeHtml(unit*Number(item.quantity||0))}</td></tr>`;}).join('')}</tbody><tfoot><tr><th colspan="3" scope="row">Box value</th><td>${escapeHtml(total)}</td></tr></tfoot></table></details>`;}).join('')}</section><fieldset class="card"><legend><strong>Insurance</strong></legend><p>Would you like insurance protection for this shipment?</p><label class="address-toggle"><input type="radio" name="insurance" data-field="is_insured" value="1" ${value.is_insured==='1'?'checked':''}> Yes</label><label class="address-toggle"><input type="radio" name="insurance" data-field="is_insured" value="0" ${value.is_insured!=='1'?'checked':''}> No</label><p class="muted">Your selection is included in the rate request.</p></fieldset><p class="muted">${value.boxes.length} box${value.boxes.length===1?'':'es'} · ${itemCount} physical item${itemCount===1?'':'s'}</p></section>`;
  }

  private renderAddress(role: 'sender' | 'receiver', address: ShipmentRateDraftAddress): string {
    const countryLocked = inferShipmentMode(this.#value?.addresses, this.legacyMode()) === 'SFN' && role === 'sender';
    if (countryLocked && !address.country) address.country = 'NG';
    const selectedCountry = this.#countries.find((country) => country.code === address.country);
    const states = selectedCountry?.states ?? [];
    return `<section class="card"><div class="panel-heading"><h3>${role === 'sender' ? 'Sender details' : 'Receiver details'}</h3><p class="muted">Enter the contact and delivery address. Coordinates are managed internally or supplied by an optional address provider.</p></div>${this.#locationsStatus?`<p class="alert info" role="status">${escapeHtml(this.#locationsStatus)}</p>`:''}<div class="grid"><label>Country<select data-path="addresses.${role}.country" data-address="${role}" data-field="country" ${countryLocked?'disabled aria-disabled="true"':''} ${this.issueAttributes(`addresses.${role}.country`)}><option value="">Select country</option>${this.#countries.map(country=>`<option value="${escapeHtml(country.code)}" ${country.code===(countryLocked?'NG':address.country)?'selected':''}>${escapeHtml(country.name)}</option>`).join('')}</select>${countryLocked?'<input type="hidden" data-address="sender" data-field="country" value="NG">':''}${this.issueMarkup(`addresses.${role}.country`)}</label><label>State<select data-path="addresses.${role}.state" data-address="${role}" data-field="state" ${states.length?'':'disabled'} ${this.issueAttributes(`addresses.${role}.state`)}><option value="">${states.length?'Select state':'Select a country first'}</option>${states.map(state=>`<option value="${escapeHtml(state.code)}" ${state.code===address.state?'selected':''}>${escapeHtml(state.name)}</option>`).join('')}</select>${this.issueMarkup(`addresses.${role}.state`)}</label>${addressFields.map(([key, label, type]) => {
      const path = `addresses.${role}.${String(key)}`;
      return `<label>${label}<input type="${type}" data-path="${path}" data-address="${role}" data-field="${String(key)}" value="${escapeHtml(address[key])}" ${key==='address'?'data-places-input':''} ${this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`;
    }).join('')}${this.#config.googlePlaces?.provider||this.#config.googlePlaces?.loader?`<label class="address-toggle"><input type="checkbox" disabled aria-disabled="true" ${address.google_address==='1'?'checked':''}> Google-verified address</label>`:''}<p class="muted" role="status" data-places-status="${role}">${escapeHtml(this.#placesStatus || (this.#config.googlePlaces?.provider||this.#config.googlePlaces?.loader?'Google address is optional. Select a provider suggestion to verify it.':'Manual address entry is active.'))}</p></div></section>`;
  }

  private renderBox(box: RateBoxDraft, boxIndex: number): string {
    const contentsWeight = box.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.weight || 0), 0);
    const totalValue=box.items.reduce((sum,item)=>sum+Number(item.unit_price??item.price??0)*Number(item.quantity||0),0);
    return `<article class="card box"><div class="section-title"><div><h3>Box ${boxIndex + 1}</h3><p class="muted">Stable API index ${escapeHtml(box.index)}</p></div><div><button class="secondary" type="button" data-action="edit-box" data-box="${boxIndex}">Edit box</button> <button class="danger" type="button" data-action="remove-box" data-box="${boxIndex}" ${this.#value!.boxes.length === 1 ? 'disabled' : ''}>Remove box</button></div></div><p><strong>${escapeHtml(box.length)} × ${escapeHtml(box.width)} × ${escapeHtml(box.height)} ${escapeHtml(this.#value!.units.dimension)}</strong> · Gross ${escapeHtml(box.weight)} ${escapeHtml(this.#value!.units.mass)}</p><p class="muted">Contents weight: ${escapeHtml(contentsWeight.toFixed(2))} ${escapeHtml(this.#value!.units.mass)}. Gross weight must include contents and tare.</p><table class="item-table"><caption>Items in Box ${boxIndex+1}</caption><thead><tr><th>Item</th><th>Qty</th><th>Unit value</th><th>Total</th><th>Actions</th></tr></thead><tbody>${box.items.map((item,itemIndex)=>{const unit=Number(item.unit_price??item.price??0);return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(unit)}</td><td>${escapeHtml(unit*Number(item.quantity||0))}</td><td><button class="secondary" type="button" data-action="edit-item" data-box="${boxIndex}" data-item="${itemIndex}">Edit</button> <button class="danger" type="button" data-action="remove-item" data-box="${boxIndex}" data-item="${itemIndex}" ${box.items.length===1?'disabled':''}>Delete</button></td></tr>`;}).join('')}</tbody><tfoot><tr><th colspan="3">Box value</th><td colspan="2">${escapeHtml(totalValue)}</td></tr></tfoot></table><button class="secondary" type="button" data-action="add-item" data-box="${boxIndex}">Add item</button></article>`;
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
    return `<div class="item"><div class="section-title"><strong>Item ${itemIndex + 1}</strong></div><div class="grid">${fields.map(([key, label, type]) => { const path = `boxes.${boxIndex}.items.${itemIndex}.${String(key)}`; const editorInvalid=this.#editor?.kind==='item'&&this.#editor.errorField===key; return `<label>${label}<input type="${type}" data-path="${path}" data-box="${boxIndex}" data-item="${itemIndex}" data-item-field="${String(key)}" value="${escapeHtml(item[key])}" ${editorInvalid?'aria-invalid="true" aria-describedby="editor-error"':this.issueAttributes(path)}>${this.issueMarkup(path)}</label>`; }).join('')}<div class="combobox"><label>Find closest product<input role="combobox" aria-autocomplete="list" aria-expanded="${this.#productOpen.has(resultKey)}" aria-controls="${listId}" ${active >= 0 ? `aria-activedescendant="${listId}-option-${active}"` : ''} data-product-query data-box="${boxIndex}" data-item="${itemIndex}" autocomplete="off" value="${escapeHtml(this.#productQueries.get(resultKey) ?? item.product_hs_code_description ?? item.name)}" ${this.#editor?.kind==='item'&&this.#editor.errorField==='product_hs_code'?'aria-invalid="true" aria-describedby="editor-error"':''}></label><ul id="${listId}" class="combobox-results" role="listbox" ${this.#productOpen.has(resultKey) ? '' : 'hidden'}>${results.map((product, index) => `<li id="${listId}-option-${index}" role="option" aria-selected="${index === active}" data-product-option data-box="${boxIndex}" data-item="${itemIndex}" data-index="${index}" data-hs="${escapeHtml(product.hs_code)}" data-name="${escapeHtml(product.name)}"><strong>${escapeHtml(product.name)}</strong><small>HS ${escapeHtml(product.hs_code)}</small></li>`).join('')}</ul>${item.product_hs_code ? `<div class="selected-product"><span>${escapeHtml(item.product_hs_code_description ?? 'Selected product')} · HS ${escapeHtml(item.product_hs_code)}</span><button class="secondary" type="button" data-action="clear-product" data-box="${boxIndex}" data-item="${itemIndex}">Clear</button></div>` : ''}<p class="muted" role="status" aria-live="polite">${escapeHtml(this.#productStatus.get(resultKey) ?? 'Type at least 3 characters; search starts automatically.')}</p></div></div></div>`;
  }

  private renderEditor(): string {
    const editor=this.#editor;if(!editor)return '';
    if(editor.kind==='box'){
      const box=editor.draft;
      return `<dialog aria-labelledby="editor-title" aria-describedby="editor-description"><section class="card stack"><div class="section-title"><div><h3 id="editor-title">${editor.added?'Add':'Edit'} box</h3><p id="editor-description" class="muted">Enter package dimensions and gross weight.</p></div><button type="button" class="secondary" data-action="cancel-editor" aria-label="Close editor">×</button></div>${editor.error?`<p id="editor-error" class="alert error" role="alert">${escapeHtml(editor.error)}</p>`:''}<div class="grid">${(['length','width','height','weight'] as const).map(key=>`<label>${key==='weight'?'Gross weight':key[0]!.toUpperCase()+key.slice(1)}<input data-editor-initial="${key==='length'}" inputmode="decimal" data-box="${editor.box}" data-box-field="${key}" value="${escapeHtml(box[key])}" ${editor.errorField===key?'aria-invalid="true" aria-describedby="editor-error"':''}></label>`).join('')}</div><div class="actions"><button type="button" class="secondary" data-action="cancel-editor">Cancel</button><button type="button" class="primary" data-action="save-editor">Save box</button></div></section></dialog>`;
    }
    const itemIndex=editor.item;const item=editor.draft;
    return `<dialog aria-labelledby="editor-title" aria-describedby="editor-description"><section class="card stack"><div class="section-title"><div><h3 id="editor-title">${editor.added?'Add':'Edit'} item</h3><p id="editor-description" class="muted">Use an everyday name and select the closest Products API classification.</p></div><button type="button" class="secondary" data-action="cancel-editor" aria-label="Close editor">×</button></div>${editor.error?`<p id="editor-error" class="alert error" role="alert">${escapeHtml(editor.error)}</p>`:''}${this.renderItem(item,editor.box,itemIndex)}<div class="actions"><button type="button" class="secondary" data-action="cancel-editor">Cancel</button><button type="button" class="primary" data-action="save-editor">Save item</button></div></section></dialog>`;
  }

  private itemFor(boxIndex:number,itemIndex:number):RateItemDraft {
    return this.#editor?.kind==='item'&&this.#editor.box===boxIndex&&this.#editor.item===itemIndex
      ? this.#editor.draft : this.#value!.boxes[boxIndex]!.items[itemIndex]!;
  }

  private bind(): void {
    const form = this.root.querySelector('form')!;
    form.addEventListener('input', (event) => this.handleInput(event));
    form.addEventListener('change', (event) => this.handleInput(event));
    form.addEventListener('click', (event) => this.handleAction(event));
    form.addEventListener('keydown', (event) => this.handleProductKeydown(event as KeyboardEvent));
    form.querySelector('dialog')?.addEventListener('keydown',(event)=>{if((event as KeyboardEvent).key==='Escape'){event.preventDefault();this.closeEditor(false);}});
    form.querySelector('[data-action="next-step"]')?.addEventListener('click', () => { this.#step = Math.min(this.lastStep, this.#step + 1); this.render(); });
    form.querySelector('[data-action="previous-step"]')?.addEventListener('click', () => { this.#step = Math.max(0, this.#step - 1); this.render(); });
    form.querySelectorAll<HTMLButtonElement>('[data-action="search-product"]').forEach((button) => button.addEventListener('click', () => void this.searchProducts(Number(button.dataset.box), Number(button.dataset.item))));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = validateRateRequest(this.#value!, this.legacyMode());
      this.#issues = result.issues;
      if (!result.valid) {
        const firstPath = result.issues[0]?.path ?? '';
        this.#step = firstPath.startsWith('addresses.sender') ? this.stepIndex('sender')
          : firstPath.startsWith('addresses.receiver') ? this.stepIndex('receiver')
            : firstPath.startsWith('boxes') ? this.stepIndex('items') : this.#step;
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
    void this.attachPlaces();
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.matches('[data-product-query]')) {
      const boxIndex = Number(input.dataset.box); const itemIndex = Number(input.dataset.item); const key = `${boxIndex}:${itemIndex}`;
      this.#productQueries.set(key, input.value); this.#productSearches.get(key)?.controller.abort(); this.#productSearches.delete(key);
      const pending = this.#productDebounces.get(key); if (pending !== undefined) clearTimeout(pending);
      const item = this.itemFor(boxIndex,itemIndex); item.product_hs_code = ''; delete item.product_hs_code_description; this.#productResults.delete(key);
      this.#productOpen.delete(key); this.#productActive.delete(key); input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); const combobox=input.closest('.combobox'); combobox?.querySelector('.selected-product')?.remove(); combobox?.querySelector<HTMLElement>('[role="listbox"]')?.setAttribute('hidden','');
      if (input.value.trim().length < 3) { this.#productStatus.set(key, 'Type at least 3 characters to search.'); this.#productDebounces.delete(key); return; }
      this.#productStatus.set(key, 'Waiting to search…');
      this.#productDebounces.set(key, window.setTimeout(() => { this.#productDebounces.delete(key); void this.searchProducts(boxIndex, itemIndex); }, 350));
      return;
    }
    const field = input.dataset.field;
    const role = input.dataset.address as 'sender' | 'receiver' | undefined;
    if (role && field) {
      const address = this.#value!.addresses[role] as unknown as Record<string, unknown>;
      {
        address[field] = input.value;
        if (field === 'country') {
          address.state = '';
          const mode = inferShipmentMode(this.#value!.addresses, this.legacyMode());
          if (mode) applyModeRules(this.#value!, mode);
          this.render();
        } else if (address.google_address === '1') {
          address.google_address = '0';
          if (!this.#config.retainCoordinatesOnManualEdit) { address.longitude = null; address.latitude = null; }
        }
      }
    }
    if (!role && field === 'is_insured') this.#value!.is_insured = input.value as '0' | '1';
    const boxIndex = Number(input.dataset.box);
    if (Number.isInteger(boxIndex) && input.dataset.boxField) {
      const box=this.#editor?.kind==='box'&&this.#editor.box===boxIndex?this.#editor.draft:this.#value!.boxes[boxIndex]!;
      (box as unknown as Record<string, unknown>)[input.dataset.boxField] = input.value;
    }
    const itemIndex = Number(input.dataset.item);
    if (Number.isInteger(boxIndex) && Number.isInteger(itemIndex) && input.dataset.itemField) {
      const key = input.dataset.itemField;
      const item = this.itemFor(boxIndex,itemIndex) as unknown as Record<string, unknown>;
      if ((key === 'price' || key === 'product_hs_code_description') && input.value.trim() === '') {
        delete item[key];
      } else {
        item[key] = input.type === 'number' ? Number(input.value) : input.value;
      }
    }
    if (!this.#editor) this.emit('africanies-change', clone(this.#value!));
  }

  private legacyMode(): 'SFN' | 'STN' | undefined {
    return this.#client?.shipmentMode ?? (this.hasAttribute('shipment-mode') ? this.shipmentMode : undefined);
  }

  private effectiveMode(): 'SFN' | 'STN' {
    return inferShipmentMode(this.#value?.addresses, this.legacyMode()) ?? 'SFN';
  }

  private async loadCountries(loader: () => Promise<AfricaniesCountryOption[]>): Promise<void> {
    this.#locationsStatus = 'Loading countries and states…';
    if (this.isConnected) this.render();
    try {
      const countries = await loader();
      if (!Array.isArray(countries) || countries.length === 0) throw new Error('No countries were returned.');
      this.#countries = clone(countries); this.#locationsStatus = '';
    } catch (cause) {
      this.#countries = defaultCountries;
      this.#locationsStatus = `${cause instanceof Error ? cause.message : 'Locations could not be loaded.'} Using the built-in list.`;
    }
    if (this.isConnected) this.render();
  }

  private cleanupPlaces(): void {
    for (const cleanup of this.#placesCleanup.splice(0)) cleanup();
  }

  private async attachPlaces(): Promise<void> {
    this.cleanupPlaces();
    const config = this.#config.googlePlaces;
    if (!config) return;
    let provider = this.#placesProvider;
    try {
      if (!provider && config.loader) {
        this.#placesLoading ??= config.loader(config.apiKey);
        provider = await this.#placesLoading; this.#placesProvider = provider;
      }
      if (!provider || !this.isConnected) return;
      for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-places-input]')) {
        const role = input.dataset.address as 'sender' | 'receiver';
        const cleanup = provider.attach(input, (place) => {
          const address = this.#value!.addresses[role];
          address.address = place.address; address.address_in_detail = place.address;
          if (place.city !== undefined) address.city = place.city;
          if (place.country !== undefined) address.country = place.country;
          if (place.state !== undefined) address.state = place.state;
          if (place.zipCode !== undefined) address.zip_code = place.zipCode;
          if (place.streetNumber !== undefined) address.street_number = place.streetNumber;
          if (place.streetName !== undefined) address.street_name = place.streetName;
          address.latitude = Number.isFinite(place.latitude) ? place.latitude! : null;
          address.longitude = Number.isFinite(place.longitude) ? place.longitude! : null;
          address.google_address = '1'; this.#placesStatus = 'Google address selected.';
          this.emit('africanies-change', clone(this.#value!)); this.render();
        });
        if (typeof cleanup === 'function') this.#placesCleanup.push(cleanup);
      }
    } catch (cause) {
      this.#placesStatus = `${cause instanceof Error ? cause.message : 'Google address could not be loaded.'} Continue with manual entry.`;
      if (this.isConnected) this.render();
    }
  }

  private async searchProducts(boxIndex: number, itemIndex: number): Promise<void> {
    if (!this.#client) return;
    const client = this.#client;
    const query = (this.#productQueries.get(`${boxIndex}:${itemIndex}`) ?? this.root.querySelector<HTMLInputElement>(`[data-product-query][data-box="${boxIndex}"][data-item="${itemIndex}"]`)?.value ?? '').trim();
    const key = `${boxIndex}:${itemIndex}`; const item = this.itemFor(boxIndex,itemIndex);
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
      this.#editor={kind:'box',box:this.#value!.boxes.length,added:true,returnAction:'add-box',draft:emptyBox(nextIndex)};this.render();return;
    }
    if(button.dataset.action==='edit-box'){this.#editor={kind:'box',box:boxIndex,added:false,returnAction:`edit-box:${boxIndex}`,draft:clone(this.#value!.boxes[boxIndex]!)};this.render();return;}
    if (button.dataset.action === 'remove-box' && this.#value!.boxes.length > 1) { if(!window.confirm(`Remove Box ${boxIndex+1} and all assigned items?`))return;this.#value!.boxes.splice(boxIndex, 1); this.clearProductInteractionState(); changed = true; }
    if (button.dataset.action === 'add-item') { const item=this.#value!.boxes[boxIndex]!.items.length;this.#editor={kind:'item',box:boxIndex,item,added:true,returnAction:`add-item:${boxIndex}`,draft:emptyItem()};this.render();return; }
    if(button.dataset.action==='edit-item'){const item=Number(button.dataset.item);this.#editor={kind:'item',box:boxIndex,item,added:false,returnAction:`edit-item:${boxIndex}:${button.dataset.item}`,draft:clone(this.#value!.boxes[boxIndex]!.items[item]!)};this.render();return;}
    if (button.dataset.action === 'remove-item' && this.#value!.boxes[boxIndex]!.items.length > 1) { const item=Number(button.dataset.item);if(!window.confirm(`Delete ${this.#value!.boxes[boxIndex]!.items[item]!.name||`Item ${item+1}`}?`))return;this.#value!.boxes[boxIndex]!.items.splice(item, 1); this.clearProductInteractionState(); changed = true; }
    if(button.dataset.action==='cancel-editor'){this.closeEditor(false);return;}
    if(button.dataset.action==='save-editor'){this.closeEditor(true);return;}
    if(button.dataset.action==='edit-step'){this.#step=Number(button.dataset.step);this.render();return;}
    if (button.dataset.action === 'clear-product') { const itemIndex=Number(button.dataset.item); const key=`${boxIndex}:${itemIndex}`; this.#productSearches.get(key)?.controller.abort(); this.#productSearches.delete(key); const pending=this.#productDebounces.get(key); if(pending!==undefined)clearTimeout(pending); this.#productDebounces.delete(key); const item=this.itemFor(boxIndex,itemIndex); item.product_hs_code=''; delete item.product_hs_code_description; this.#productQueries.set(key,''); this.#productResults.delete(key); this.#productOpen.delete(key); this.#productActive.delete(key); changed=true; }
    if (!changed) return;
    this.render();
    this.emit('africanies-change', clone(this.#value!));
  }

  private closeEditor(save:boolean):void {
    const editor=this.#editor;if(!editor)return;
    if(save){
      const error=editor.kind==='box'?this.validateBoxEditor(editor.draft):this.validateItemEditor(editor.draft);
      if(error){editor.error=error.message;editor.errorField=error.field;this.render();queueMicrotask(()=>this.root.querySelector<HTMLElement>(editor.kind==='box'?`[data-box-field="${error.field}"]`:error.field==='product_hs_code'?'[data-product-query]':`[data-item-field="${error.field}"]`)?.focus());return;}
      if(editor.kind==='box'){if(editor.added)this.#value!.boxes.push(clone(editor.draft));else this.#value!.boxes[editor.box]=clone(editor.draft);}
      else {if(editor.added)this.#value!.boxes[editor.box]!.items.push(clone(editor.draft));else this.#value!.boxes[editor.box]!.items[editor.item]=clone(editor.draft);}
      this.emit('africanies-change',clone(this.#value!));
    }
    const returnAction=editor.returnAction;this.#editor=undefined;this.render();
    queueMicrotask(()=>{const [action,box,item]=returnAction.split(':');this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]${box?`[data-box="${box}"]`:''}${item?`[data-item="${item}"]`:''}`)?.focus();});
  }

  private validateBoxEditor(box:RateBoxDraft):{message:string;field:string}|undefined {
    const invalid=(['length','width','height','weight'] as const).find(key=>!(Number(box[key])>0));if(invalid)return {message:'Length, width, height, and gross weight must all be greater than zero.',field:invalid};
    const contents=box.items.reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.weight||0),0);
    if(Number(box.weight)+1e-9<contents)return {message:`Gross weight must be at least ${contents} ${this.#value!.units.mass}.`,field:'weight'};
    return undefined;
  }

  private validateItemEditor(item:RateItemDraft):{message:string;field:string}|undefined {
    if(!item.name.trim())return {message:'Item name is required.',field:'name'};
    if(!item.description.trim())return {message:'Description is required.',field:'description'};
    if(!item.product_hs_code.trim())return {message:'Select a Products API classification.',field:'product_hs_code'};
    if(!item.country.trim())return {message:'Country of origin is required.',field:'country'};
    if(!(Number(item.quantity)>0))return {message:'Quantity must be greater than zero.',field:'quantity'};
    if(!(Number(item.weight)>0))return {message:'Unit weight must be greater than zero.',field:'weight'};
    if(!(Number(item.unit_price)>0))return {message:'Unit price must be greater than zero.',field:'unit_price'};
    if(!(Number(item.amount)>0))return {message:'Amount must be greater than zero.',field:'amount'};
    return undefined;
  }

  private selectProduct(boxIndex:number,itemIndex:number,index:number):void { const key=`${boxIndex}:${itemIndex}`; const product=this.#productResults.get(key)?.[index]; if(!product)return; const item=this.itemFor(boxIndex,itemIndex); item.product_hs_code=product.hs_code; item.product_hs_code_description=product.name; this.#productQueries.set(key,product.name); this.#productOpen.delete(key); this.#productStatus.set(key,`${product.name} · HS ${product.hs_code}`); if(!this.#editor)this.emit('africanies-change',clone(this.#value!)); this.render(); }

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
