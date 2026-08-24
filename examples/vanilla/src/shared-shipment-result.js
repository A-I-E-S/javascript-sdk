const MAX_BASE64_DOCUMENT_BYTES = 10 * 1024 * 1024;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character]);
const money = (value, currency) => new Intl.NumberFormat('en-NG', { style:'currency', currency }).format(Number(value));

function httpsUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

function decodeBase64(value, urls) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return { error:'Malformed Base64 document' };
  if (value.length > Math.ceil(MAX_BASE64_DOCUMENT_BYTES / 3) * 4) return { error:'Base64 document exceeds the 10 MB browser download limit' };
  try {
    const decoded = atob(value);
    if (decoded.length > MAX_BASE64_DOCUMENT_BYTES) return { error:'Base64 document exceeds the 10 MB browser download limit' };
    const url = URL.createObjectURL(new Blob([Uint8Array.from(decoded, (character) => character.charCodeAt(0))], { type:'application/pdf' }));
    urls.push(url); return { url };
  } catch { return { error:'Malformed Base64 document' }; }
}

function documentCard(document, urls) {
  const { label, value, isUrl, required=false, notRequested=false } = document;
  if (notRequested) return `<div class="document-card unavailable"><span>—</span><strong>${escapeHtml(label)}</strong><small>Not requested</small></div>`;
  const href = isUrl === 1 ? httpsUrl(value) : null;
  if (href) return `<a class="document-card" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><span>PDF</span><strong>${escapeHtml(label)}</strong><small>Open document ↗</small></a>`;
  const decoded = isUrl === 0 && value ? decodeBase64(value, urls) : null;
  if (decoded?.url) return `<a class="document-card" href="${escapeHtml(decoded.url)}" download="${escapeHtml(label.toLowerCase().replaceAll(' ', '-'))}.pdf"><span>PDF</span><strong>${escapeHtml(label)}</strong><small>Download Base64 document</small></a>`;
  if (decoded?.error) return `<div class="document-card unavailable"><span>!</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(decoded.error)}</small></div>`;
  return `<div class="document-card unavailable"><span>—</span><strong>${escapeHtml(label)}</strong><small>${required ? 'Required document unavailable' : 'Not returned'}</small></div>`;
}

export function mountSharedShipmentResult(container, input) {
  const model = structuredClone(input); const urls = [];
  const tracking = httpsUrl(model.shipment.trackingUrl);
  const insurance = model.payment.insured ? money(model.payment.insurance, model.payment.currency) : 'Not requested';
  container.innerHTML = `<section class="shared-shipment-result" aria-labelledby="shipment-result-title"><div class="success-mark" aria-hidden="true">✓</div><p class="eyebrow">Shipment purchased</p><h2 id="shipment-result-title">Your shipment is on its way</h2><div class="tracking-card"><div><small>REFERENCE</small><strong>${escapeHtml(model.shipment.reference)}</strong></div><div><small>TRACKING NUMBER</small><strong>${escapeHtml(model.shipment.trackingNumber)}</strong></div>${tracking ? `<a class="primary button-link" href="${escapeHtml(tracking)}" target="_blank" rel="noopener noreferrer">Track shipment</a>` : ''}</div><div class="panel payment-record" role="status"><div class="payment-record-head"><div><small>PAYDEMO FULL ORDER + DELIVERY</small><h3>Payment recorded</h3></div><span class="payment-status-badge">Paid</span></div><strong class="payment-record-total">${escapeHtml(money(model.payment.amount, model.payment.currency))}</strong><dl><div><dt>Reference</dt><dd>${escapeHtml(model.payment.id)}</dd></div><div><dt>Merchandise</dt><dd>${escapeHtml(money(model.payment.merchandise, model.payment.currency))}</dd></div><div><dt>Delivery</dt><dd>${escapeHtml(money(model.payment.delivery, model.payment.currency))}</dd></div><div><dt>Insurance</dt><dd>${escapeHtml(insurance)}</dd></div><div><dt>Carrier</dt><dd>${escapeHtml(model.payment.carrier)}</dd></div><div><dt>Confirmed</dt><dd>${escapeHtml(model.payment.confirmedAt || 'Confirmed by PayDemo')}</dd></div></dl></div><h3>Shipment documents</h3><div class="documents">${[model.documents.waybill,model.documents.invoice,model.documents.insurance].map((document) => documentCard(document, urls)).join('')}</div></section>`;
  container.querySelector('h2')?.setAttribute('tabindex', '-1'); container.querySelector('h2')?.focus();
  let disposed = false;
  return { root:container.querySelector('.shared-shipment-result'), dispose() { if (disposed) return; disposed = true; urls.splice(0).forEach((url) => URL.revokeObjectURL(url)); } };
}
