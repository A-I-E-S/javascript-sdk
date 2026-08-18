import type { AfricaniesEnvironment, ShipmentMode } from '../types.js';

export const sharedStyles = `
  :host {
    --africanies-primary: #1c2b3f;
    --africanies-accent: #1cbd5d;
    --africanies-accent-hover: #15994a;
    --africanies-import: #f08829;
    --africanies-text: #1c2b3f;
    --africanies-muted: #667185;
    --africanies-border: #dbe1ea;
    --africanies-surface: #f9fafb;
    --africanies-danger: #c00b19;
    color: var(--africanies-text);
    display: block;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.45;
  }
  * { box-sizing: border-box; }
  .shell { background: var(--africanies-surface); border: 1px solid var(--africanies-border); border-radius: 16px; padding: clamp(16px, 3vw, 32px); }
  .topline { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; margin-bottom: 24px; }
  h2, h3, p { margin-top: 0; }
  h2 { font-size: clamp(1.35rem, 4vw, 2rem); margin-bottom: 4px; }
  h3 { font-size: 1rem; }
  .muted { color: var(--africanies-muted); }
  .test-mode { align-items: center; background: #fff4df; border: 1px solid #f08829; border-radius: 999px; color: #743a00; display: inline-flex; font-size: 12px; font-weight: 800; gap: 6px; letter-spacing: .04em; padding: 7px 11px; text-transform: uppercase; }
  .test-mode::before { content: "⚠"; }
  .card { background: white; border: 1px solid var(--africanies-border); border-radius: 12px; padding: 18px; }
  .stack { display: grid; gap: 16px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
  label { color: var(--africanies-muted); display: grid; font-size: 13px; font-weight: 650; gap: 6px; }
  input, select, textarea { background: white; border: 1px solid var(--africanies-border); border-radius: 9px; color: var(--africanies-text); font: inherit; min-height: 44px; padding: 10px 12px; width: 100%; }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid color-mix(in srgb, var(--africanies-accent) 35%, transparent); outline-offset: 2px; }
  button, .button { align-items: center; border: 0; border-radius: 999px; cursor: pointer; display: inline-flex; font: inherit; font-weight: 750; justify-content: center; min-height: 44px; padding: 10px 18px; text-decoration: none; }
  button.primary, .button.primary { background: var(--africanies-accent); color: #071b0f; }
  button.primary:hover { background: var(--africanies-accent-hover); color: white; }
  button.secondary { background: white; border: 1px solid var(--africanies-border); color: var(--africanies-primary); }
  button.danger { background: #fff1f3; color: var(--africanies-danger); }
  button:disabled { cursor: not-allowed; opacity: .55; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 18px; }
  .alert { border-radius: 10px; padding: 12px 14px; }
  .alert.error { background: #fff1f3; border: 1px solid #ffc8cf; color: #78000e; }
  .alert.info { background: #eef7ff; border: 1px solid #c8e4ff; }
  .sr-only { clip: rect(0,0,0,0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
  @media (max-width: 640px) {
    .shell { border-radius: 0; border-left: 0; border-right: 0; padding: 16px; }
    .actions { align-items: stretch; flex-direction: column-reverse; }
    .actions button, .actions .button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
`;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function testModeMarkup(environment: AfricaniesEnvironment): string {
  return environment === 'test'
    ? '<span class="test-mode" role="status" aria-label="AfricanIES SDK test mode">Test mode</span>'
    : '';
}

export function safeExternalUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export abstract class AfricaniesElement extends HTMLElement {
  static observedAttributes = ['environment', 'shipment-mode'];
  protected readonly root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get environment(): AfricaniesEnvironment {
    return this.getAttribute('environment') === 'live' ? 'live' : 'test';
  }

  set environment(value: AfricaniesEnvironment) {
    this.setAttribute('environment', value);
  }

  get shipmentMode(): ShipmentMode {
    return this.getAttribute('shipment-mode') === 'STN' ? 'STN' : 'SFN';
  }

  set shipmentMode(value: ShipmentMode) {
    this.setAttribute('shipment-mode', value);
  }

  connectedCallback(): void {
    this.syncEnvironment();
    this.render();
  }

  attributeChangedCallback(_name: string, _oldValue: string | null, _newValue: string | null): void {
    this.syncEnvironment();
    if (this.isConnected) this.render();
  }

  protected syncEnvironment(): void {
    this.dataset.environment = this.environment;
  }

  protected emit<T>(name: string, detail: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  protected abstract render(): void;
}
