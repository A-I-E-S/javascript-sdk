import type { AfricaniesClient } from '../client.js';
import type { ShipmentPurchaseRequest } from '../types.js';
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
      .success { background:#e4fff3; border:1px solid #9de5bd; text-align:center; }
      .reference { font-size:1.3rem; font-weight:850; overflow-wrap:anywhere; }
      .documents { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
      .document-unavailable { display:grid; gap:6px; }
    </style><section class="shell"><div class="topline"><div><h2>${result ? 'Shipment confirmed' : 'Purchase shipment'}</h2><p class="muted">${result ? 'Your booking details and documents' : 'Review and confirm your shipment purchase'}</p></div>${testModeMarkup(this.environment)}</div>
      ${!this.#client || !this.#request ? '<div class="alert info">Set both <code>client</code> and <code>request</code> properties to purchase.</div>' : ''}
      ${state?.issues.length ? `<div class="alert error" role="alert"><strong>Purchase request needs attention</strong><ul>${state.issues.map((issue) => `<li>${escapeHtml(issue.path)}: ${escapeHtml(issue.message)}</li>`).join('')}</ul></div>` : ''}
      ${state?.status === 'error' ? this.renderApiError(state.error) : ''}
      ${!result && this.#request ? `<div class="card stack"><div><span class="muted">External reference</span><div class="reference">${escapeHtml(this.#request.external_reference)}</div></div><div class="grid"><div><span class="muted">Shipping method</span><p>${escapeHtml(this.#request.shipment_method_slug)}</p></div><div><span class="muted">Boxes</span><p>${this.#request.boxes.length}</p></div><div><span class="muted">Assigned date</span><p>${escapeHtml(this.#request.assigned_date)}</p></div></div></div>` : ''}
      ${result ? `<div class="card success" role="status"><h3>Shipment purchased successfully</h3><div class="reference">${escapeHtml(result.reference)}</div><p>Tracking number: <strong>${escapeHtml(result.tracking_number)}</strong></p>${safeExternalUrl(result.tracking_url) ? `<a class="button primary" target="_blank" rel="noopener noreferrer" href="${escapeHtml(safeExternalUrl(result.tracking_url))}">Track shipment</a>` : ''}</div><h3 style="margin-top:20px">Documents</h3><div class="documents">${renderDocument('Waybill document', result.documents.waybill_doc, result.waybill_is_url)}${renderDocument('Insurance document', result.documents.insurance_doc, result.insurance_is_url)}${renderDocument('Invoice document', result.documents.invoice_doc, result.invoice_is_url, true)}</div>` : ''}
      ${!result && this.#request ? `<div class="actions"><button class="primary" type="button" data-action="purchase" ${state?.status === 'submitting' ? 'disabled' : ''}>${state?.status === 'submitting' ? 'Purchasing…' : 'Purchase shipment'}</button></div>` : ''}
    </section>`;
    this.root.querySelector('[data-action="purchase"]')?.addEventListener('click', () => void this.submit());
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
