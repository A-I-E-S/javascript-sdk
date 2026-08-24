import type { AfricaniesClient } from '../client.js';
import type { ShipmentRateRequest } from '../types.js';
import { RateSelectionController } from '../ui/controllers.js';
import { AfricaniesElement, escapeHtml, testModeMarkup } from './base.js';

function formatAmount(value: unknown): string {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && value.trim() === '')) return 'Unavailable';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : 'Unavailable';
}

export class AfricaniesRateSelectionElement extends AfricaniesElement {
  #client: AfricaniesClient | undefined;
  #request: ShipmentRateRequest | undefined;
  #controller: RateSelectionController | undefined;
  #unsubscribe: (() => void) | undefined;

  set client(value: AfricaniesClient | undefined) { this.#client = value; this.projectClientConfiguration(value); this.connectController(); }
  get client(): AfricaniesClient | undefined { return this.#client; }
  set request(value: ShipmentRateRequest | undefined) { this.#request = value; this.connectController(); }
  get request(): ShipmentRateRequest | undefined { return this.#request; }

  override connectedCallback(): void {
    super.connectedCallback();
    this.connectController();
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#controller?.cancel();
  }

  async load(): Promise<void> {
    if (!this.#controller) this.connectController(false);
    if (!this.#controller) return;
    try {
      await this.#controller.load();
    } catch (error) {
      this.emit('africanies-error', error);
      throw error;
    }
  }

  protected render(): void {
    const state = this.#controller?.state;
    this.root.innerHTML = `${this.sharedStyleTag()}<section class="shell"><div class="topline"><div><h2>Shipment carrier</h2><p class="muted">Select a shipping method to review its final cost.</p></div>${testModeMarkup(this.environment)}</div>
      <div class="rates-heading"><h3>Select shipment carrier</h3><span class="muted">Step 1/2</span></div>
      ${!this.#client || !this.#request ? '<div class="alert info">Set both <code>client</code> and <code>request</code> properties to load rates.</div>' : ''}
      ${state?.status === 'loading' ? '<p role="status">Loading rates…</p>' : ''}
      ${state?.status === 'empty' ? '<div class="alert info" role="status">No rates are available for this shipment.</div>' : ''}
      ${state?.status === 'error' ? `<div class="alert error" role="alert">${escapeHtml(state.error?.message)}</div>` : ''}
      <div class="stack">${state?.rates.map((rate) => `<article class="card rate ${state.selectedSlug === rate.slug ? 'selected' : ''}"><div class="carrier"><span class="carrier-mark" aria-hidden="true">A</span><div><h3>${escapeHtml(rate.name)}</h3><small class="muted">${escapeHtml(rate.slug)}</small></div></div><div class="availability"><span class="eyebrow">Available</span><div class="price">${escapeHtml(rate.others.currency)} ${escapeHtml(formatAmount(rate.payment_amount))}</div></div><div><span class="eyebrow">Estimated transit time</span><strong>${escapeHtml(rate.others.min_day)}–${escapeHtml(rate.others.max_day)} business days</strong></div><button class="${state.selectedSlug === rate.slug ? 'secondary' : 'primary'}" data-slug="${escapeHtml(rate.slug)}" type="button" aria-pressed="${state.selectedSlug === rate.slug}" ${state.status === 'loading' ? 'disabled' : ''}>${state.selectedSlug === rate.slug ? 'Selected ✓' : 'Select'}</button></article>`).join('') ?? ''}</div>
      <div class="actions"><button type="button" class="secondary" data-action="refresh" ${state?.status === 'loading' ? 'disabled' : ''}>Refresh rates</button><button type="button" class="primary" data-action="continue" ${!state?.selectedSlug ? 'disabled' : ''}>Continue</button></div>
    </section>`;
    this.root.querySelectorAll<HTMLButtonElement>('button[data-slug]').forEach((button) => button.addEventListener('click', () => { const rate = this.#controller!.select(button.dataset.slug!); this.emit('africanies-rate-selected', { rate, request: this.#request }); }));
    this.root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => void this.load().catch(() => undefined));
    this.root.querySelector('[data-action="continue"]')?.addEventListener('click', () => { const rate = this.#controller!.state.rates.find((candidate) => candidate.slug === this.#controller!.state.selectedSlug); if (rate) this.emit('africanies-complete', { rate, request: this.#request }); });
  }

  private connectController(autoLoad = true): void {
    this.#unsubscribe?.(); this.#unsubscribe = undefined; this.#controller?.cancel(); this.#controller = undefined;
    if (!this.#client || !this.#request) { if (this.isConnected) this.render(); return; }
    this.#controller = new RateSelectionController(this.#client, this.#request);
    if (this.isConnected) {
      this.#unsubscribe = this.#controller.subscribe(() => this.render());
      if (autoLoad) void this.load().catch(() => undefined);
    }
  }
}
