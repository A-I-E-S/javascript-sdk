import type { AfricaniesClient } from '../client.js';
import type { ShipmentPurchaseRequest, ShipmentPurchaseResult } from '../types.js';
import { PurchaseController } from '../ui/controllers.js';
import { AfricaniesElement, escapeHtml, safeExternalUrl, sharedStyles, testModeMarkup } from './base.js';

function renderDocument(label: string, value: string | null, isUrl: number, required = false): string {
  if (typeof value === 'string' && value !== '') {
    if (isUrl === 0) {
      return `<div class="card document-unavailable"><strong>${escapeHtml(label)}</strong><span class="muted">Base64 document returned; consume programmatically</span></div>`;
    }
    if (isUrl === 1) {
      const href = safeExternalUrl(value);
      if (href) {
        return `<a class="card" target="_blank" rel="noopener noreferrer" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
      }
    }
  }
  const note = required ? 'Unavailable (required document missing)' : 'Unavailable';
  return `<div class="card document-unavailable"><strong>${escapeHtml(label)}</strong><span class="muted">${note}</span></div>`;
}

export class AfricaniesPurchaseConfirmationElement extends AfricaniesElement {
  #client: AfricaniesClient | undefined;
  #request: ShipmentPurchaseRequest | undefined;
  #controller: PurchaseController | undefined;
  #unsubscribe: (() => void) | undefined;
  #connectionId = 0;
  #activeDocument: 'waybill' | 'invoice' | 'insurance' = 'waybill';

  set client(value: AfricaniesClient | undefined) { this.#client = value; this.projectClientConfiguration(value); this.connectController(); }
  get client(): AfricaniesClient | undefined { return this.#client; }
  set request(value: ShipmentPurchaseRequest | undefined) { this.#request = value; this.connectController(); }
  get request(): ShipmentPurchaseRequest | undefined { return this.#request; }
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.#controller) this.connectController();
    else this.subscribeController();
  }

  disconnectedCallback(): void {
    this.#connectionId += 1;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#controller?.cancel();
    this.#controller = undefined;
  }

  protected render(): void {
    const state = this.#controller?.state;
    const result = state?.response?.data;
    this.root.innerHTML = `<style>${sharedStyles}
      .success { background:white; border:0; padding:clamp(28px,6vw,72px); text-align:center; }
      .success-icon { align-items:center; background:var(--africanies-success-bg); border-radius:999px; color:#0a9b4d; display:flex; font-size:32px; height:72px; justify-content:center; margin:0 auto 18px; width:72px; }
      .reference { font-size:1.3rem; font-weight:850; overflow-wrap:anywhere; }
      .documents { background:white; border:1px solid var(--africanies-border); border-radius:14px; margin-top:20px; overflow:hidden; }
      .document-tabs { display:flex; overflow:auto; }
      .document-tabs button { background:white; border-bottom:2px solid var(--africanies-border); border-radius:0; color:var(--africanies-muted); flex:1; white-space:nowrap; }
      .document-tabs button[aria-selected="true"] { border-color:var(--africanies-mode); color:#087b3c; }
      .document-panel { min-height:260px; padding:20px; }
      .document-panel iframe { border:1px solid var(--africanies-border); border-radius:10px; height:480px; width:100%; }
      .document-unavailable { display:grid; gap:6px; }
    </style><section class="shell"><div class="topline"><div><h2>${result ? 'Thank you for your purchase!' : 'Purchase shipment'}</h2><p class="muted">${result ? 'Your shipment has been successfully processed.' : 'Review and confirm your shipment purchase'}</p></div>${testModeMarkup(this.environment)}</div>
      ${!this.#client || !this.#request ? '<div class="alert info">Set both <code>client</code> and <code>request</code> properties to purchase.</div>' : ''}
      ${state?.issues.length ? `<div class="alert error" role="alert"><strong>Purchase request needs attention</strong><ul>${state.issues.map((issue) => `<li>${escapeHtml(issue.path)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul></div>` : ''}
      ${state?.status === 'error' ? this.renderApiError(state.error) : ''}
      ${!result && this.#request ? `<div class="card stack"><div><span class="muted">External reference</span><div class="reference">${escapeHtml(this.#request.external_reference)}</div></div><div class="grid"><div><span class="muted">Shipping method</span><p>${escapeHtml(this.#request.shipment_method_slug)}</p></div><div><span class="muted">Boxes</span><p>${this.#request.boxes.length}</p></div><div><span class="muted">Assigned date</span><p>${escapeHtml(this.#request.assigned_date)}</p></div></div></div>` : ''}
      ${result ? `<div class="card success" role="status"><div class="success-icon" aria-hidden="true">✓</div><h3>Shipment purchased successfully</h3><p>Your shipment is being prepared for processing.</p><div class="reference">${escapeHtml(result.reference)}</div><p>Tracking number: <strong>${escapeHtml(result.tracking_number)}</strong></p>${safeExternalUrl(result.tracking_url) ? `<a class="button primary" target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeExternalUrl(result.tracking_url))}">Track shipment</a>` : ''}</div>${this.renderDocuments(result)}` : ''}
      ${!result && this.#request ? `<div class="actions"><button class="primary" type="button" data-action="purchase" ${state?.status === 'submitting' ? 'disabled' : ''}>${state?.status === 'submitting' ? 'Purchasing…' : 'Purchase shipment'}</button></div>` : ''}
    </section>`;
    this.root.querySelector('[data-action="purchase"]')?.addEventListener('click', () => void this.submit());
    this.root.querySelectorAll<HTMLButtonElement>('[data-document]').forEach((button) => {
      button.addEventListener('click', () => { this.#activeDocument = button.dataset.document as 'waybill' | 'invoice' | 'insurance'; this.render(); this.root.querySelector<HTMLButtonElement>(`[data-document="${this.#activeDocument}"]`)?.focus(); });
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const keys = ['waybill', 'invoice', 'insurance'] as const;
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        const next = (keys.indexOf(this.#activeDocument) + offset + keys.length) % keys.length;
        this.#activeDocument = keys[next]!; this.render(); this.root.querySelector<HTMLButtonElement>(`[data-document="${this.#activeDocument}"]`)?.focus();
      });
    });
  }

  private renderDocuments(result: ShipmentPurchaseResult): string {
    const documents = {
      waybill: { label: 'Shipment label', value: result.documents.waybill_doc, flag: result.waybill_is_url, required: false },
      invoice: { label: 'Shipment invoice', value: result.documents.invoice_doc, flag: result.invoice_is_url, required: true },
      insurance: { label: 'Insurance', value: result.documents.insurance_doc, flag: result.insurance_is_url, required: this.#request?.is_insured === '1' },
    };
    const active = documents[this.#activeDocument];
    const href = active.flag === 1 ? safeExternalUrl(active.value) : undefined;
    const notRequested = this.#activeDocument === 'insurance' && this.#request?.is_insured !== '1';
    const panelContent = notRequested
      ? '<div class="card document-unavailable"><strong>Insurance</strong><span class="muted">Not requested for this shipment</span></div>'
      : renderDocument(active.label, active.value, active.flag, active.required);
    const panel = href && !notRequested
      ? `<div id="africanies-document-panel" class="document-panel" role="tabpanel" aria-labelledby="africanies-document-tab-${this.#activeDocument}"><p><a class="button secondary" target="_blank" rel="noopener noreferrer" href="${escapeHtml(href)}">Open ${escapeHtml(active.label)}</a></p><iframe title="${escapeHtml(active.label)} preview" src="${escapeHtml(href)}"></iframe></div>`
      : `<div id="africanies-document-panel" class="document-panel" role="tabpanel" aria-labelledby="africanies-document-tab-${this.#activeDocument}">${panelContent}</div>`;
    return `<section class="documents"><div class="document-tabs" role="tablist" aria-label="Shipment documents">${(Object.keys(documents) as Array<keyof typeof documents>).map((key) => `<button id="africanies-document-tab-${key}" type="button" role="tab" data-document="${key}" aria-controls="africanies-document-panel" aria-selected="${key === this.#activeDocument}" tabindex="${key === this.#activeDocument ? '0' : '-1'}">${documents[key].label}</button>`).join('')}</div>${panel}</section>`;
  }

  private async submit(): Promise<void> {
    const controller = this.#controller;
    if (!controller) return;
    const connectionId = this.#connectionId;
    try {
      const response = await controller.submit();
      if (!this.isConnected || controller !== this.#controller || connectionId !== this.#connectionId) return;
      this.emit('africanies-purchased', response);
      this.emit('africanies-complete', response);
    } catch (error) {
      if (!this.isConnected || controller !== this.#controller || connectionId !== this.#connectionId) return;
      this.emit('africanies-error', error);
    }
  }

  private connectController(): void {
    this.#connectionId += 1;
    this.#unsubscribe?.(); this.#unsubscribe = undefined; this.#controller?.cancel(); this.#controller = undefined;
    if (!this.#client || !this.#request) { if (this.isConnected) this.render(); return; }
    this.#controller = new PurchaseController(this.#client, this.#request);
    this.subscribeController();
  }

  private subscribeController(): void {
    if (!this.isConnected || !this.#controller || this.#unsubscribe) return;
    this.#unsubscribe = this.#controller.subscribe(() => this.render());
  }

  private renderApiError(error: PurchaseController['state']['error']): string {
    if (!error) return '';
    let data = '';
    if (error.data !== undefined) {
      try { data = JSON.stringify(error.data, null, 2); } catch { data = String(error.data); }
    }
    const metadata = [
      error.status === undefined ? '' : `<div>HTTP status: <strong>${escapeHtml(error.status)}</strong></div>`,
      error.apiStatusCode === undefined ? '' : `<div>API status: <strong>${escapeHtml(error.apiStatusCode)}</strong></div>`,
      data ? `<pre>${escapeHtml(data)}</pre>` : '',
    ].join('');
    return `<div class="alert error" role="alert"><strong>${escapeHtml(error.message)}</strong>${metadata ? `<details><summary>Response details</summary>${metadata}</details>` : ''}</div>`;
  }
}
