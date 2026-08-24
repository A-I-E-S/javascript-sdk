import * as Shipping from '@africanies/shipping/browser';
import './styles.css';
import {
  DEMO_PRODUCTS, WAREHOUSE_ADDRESS, cartLines, cartTotals, createPackagingInput,
  receiverFromForm, shippingAmount, minimumAssignedDate, payDemoResult,
} from './demo-state.js';

const $ = (selector) => document.querySelector(selector);
const money = (value, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(value));
const html = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const state = { client: null, cart: {}, classifications: {}, productSearches: {}, lines: [], packaging: null, rateRequest: null, rates: [], quote: null, selection: null, selectedRate: null, payment: null, purchaseIntent: null, externalReference: null, purchaseState: 'idle', documentUrls: [] };

function error(message = '') { const node = $('#app-error'); node.textContent = message; node.hidden = !message; if (message) node.focus(); }
function userFacingError(cause, fallback) {
  if (cause instanceof Shipping.AfricaniesError && Array.isArray(cause.data) && cause.data.length) {
    const details = cause.data.flatMap((issue) => issue && typeof issue === 'object'
      && typeof issue.path === 'string' && typeof issue.message === 'string'
      ? [`${issue.path}: ${issue.message}`] : []);
    if (details.length) return details.join(' ');
  }
  return cause instanceof Error ? cause.message : fallback;
}
function show(id) { const order = ['catalog-section', 'address-section', 'shipping-section', 'payment-section', 'result-section']; const active = order.indexOf(id); for (const section of document.querySelectorAll('#store-view > section.content')) section.hidden = section.id !== id; document.querySelectorAll('[data-progress]').forEach((step) => { const index = Number(step.dataset.progress); step.classList.toggle('active', index === active); step.classList.toggle('done', index < active); if (index === active) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current'); }); error(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function setBusy(button, busy, label) { button.disabled = busy; if (busy) { button.dataset.label = button.textContent; button.textContent = label; } else if (button.dataset.label) button.textContent = button.dataset.label; }

function renderCatalog() {
  $('#catalog').innerHTML = DEMO_PRODUCTS.map((product) => `<article class="product-card">
    <div class="product-art ${product.id}" aria-hidden="true">${product.name.slice(0, 1)}</div>
    <div class="product-copy"><small>PRODUCT CLASSIFICATION REQUIRED</small><h3>${product.name}</h3><p>${product.description}</p>
    <dl><div><dt>Unit weight</dt><dd>${product.weight} kg</dd></div><div><dt>Size</dt><dd>${product.dimensions.length} × ${product.dimensions.width} × ${product.dimensions.height} cm</dd></div></dl>
    <div class="classification"><label>Search Africanies products<input data-product-search="${product.id}" value="${product.name}"></label><button type="button" class="secondary search-product" data-product="${product.id}">Search</button><select data-product-results="${product.id}" hidden aria-label="Select product classification"></select><p data-product-status="${product.id}" role="status" aria-live="polite">Search and select the closest human-readable product.</p></div>
    <div class="product-action"><strong>${money(product.price)}</strong><label>Qty <input class="quantity" data-product="${product.id}" type="number" min="0" max="20" step="1" value="${state.cart[product.id] ?? 0}"></label></div></div></article>`).join('');
  document.querySelectorAll('.quantity').forEach((input) => input.addEventListener('input', () => {
    state.cart[input.dataset.product] = Math.max(0, Number(input.value)); state.lines = cartLines(state.cart);
    updateCheckoutState();
  }));
  document.querySelectorAll('.search-product').forEach((button) => button.addEventListener('click', () => searchProducts(button.dataset.product, button)));
  document.querySelectorAll('[data-product-results]').forEach((select) => select.addEventListener('change', () => {
    const option = select.selectedOptions[0]; if (!option?.value) return;
    state.classifications[select.dataset.productResults] = { hs_code: option.value, name: option.textContent };
    $(`[data-product-status="${select.dataset.productResults}"]`).textContent = `Selected ${option.textContent} · HS ${option.value}`;
    updateCheckoutState();
  }));
}

function updateCheckoutState() {
  state.packaging = null; state.rateRequest = null; state.rates = []; state.quote = null; state.selection = null; state.selectedRate = null; state.payment = null; state.purchaseIntent = null; state.externalReference = null; state.purchaseState = 'idle';
  const totals = cartTotals(state.lines); $('#cart-count').textContent = totals.quantity;
  $('#checkout-button').disabled = totals.quantity === 0 || state.lines.some((line) => !state.classifications[line.id]);
}

async function searchProducts(productId, button) {
  const query = $(`[data-product-search="${productId}"]`).value.trim(); const status = $(`[data-product-status="${productId}"]`);
  const searchId = (state.productSearches[productId] ?? 0) + 1; state.productSearches[productId] = searchId;
  delete state.classifications[productId]; updateCheckoutState();
  if (!query) { status.textContent = 'Enter a product name to search.'; return; }
  setBusy(button, true, 'Searching…'); status.textContent = 'Searching Africanies products…';
  try {
    const client = state.client; const response = await client.products.search(query);
    if (state.productSearches[productId] !== searchId || state.client !== client) return;
    const results = Array.isArray(response.data) ? response.data : [];
    if (!results.length) throw new Error('No matching products were returned. Try a broader description.');
    const select = $(`[data-product-results="${productId}"]`); select.innerHTML = `<option value="">Select a classification…</option>${results.map((item) => `<option value="${html(item.hs_code)}">${html(item.name)}</option>`).join('')}`;
    select.hidden = false; status.textContent = `${results.length} matching classifications found.`;
  } catch (cause) { if (state.productSearches[productId] === searchId) status.textContent = cause instanceof Error ? cause.message : 'Product search failed.'; }
  finally { if (state.productSearches[productId] === searchId) setBusy(button, false); }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter; const status = $('#login-status'); const encodedKey = $('#encoded-key').value.trim();
  state.client = null;
  status.className = 'message'; status.textContent = 'Checking credential with Africanies sandbox…'; setBusy(button, true, 'Checking…');
  try {
    const client = Shipping.createAfricaniesClient({ environment: 'test', shipmentMode: 'SFN', auth: { encodedKey } });
    const response = await client.carriers.list();
    if (!response?.success) throw new Error(response?.message || 'Credential check was not accepted.');
    state.client = client; $('#encoded-key').value = ''; $('#login-view').hidden = true; $('#store-view').hidden = false; renderCatalog();
  } catch (cause) { status.className = 'message failure'; status.textContent = cause instanceof Error ? cause.message : 'Could not validate this credential.'; }
  finally { $('#encoded-key').value = ''; if (!state.client) $('#store-view').hidden = true; setBusy(button, false); }
});

$('#checkout-button').addEventListener('click', () => show('address-section'));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => show(button.dataset.back)));

$('#address-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter; setBusy(button, true, 'Packaging and loading rates…');
  try {
    const calculatePackaging = Shipping.calculatePackaging;
    if (typeof calculatePackaging !== 'function') throw new Error('This SDK build does not yet include automatic packaging. Install the expanded-stabilization build.');
    const packagingInput = createPackagingInput(state.lines, state.classifications);
    state.packaging = calculatePackaging(packagingInput.items, packagingInput.settings);
    const receiver = receiverFromForm(event.currentTarget);
    state.rateRequest = Shipping.buildRateRequestFromPackaging({
      addresses: { sender: { ...WAREHOUSE_ADDRESS }, receiver }, shipmentMode: 'SFN', packaging: state.packaging,
      isInsured: $('#insured').checked ? '1' : '0',
    });
    const response = await state.client.shipments.getRates(state.rateRequest);
    state.rates = response.data; if (!Array.isArray(state.rates) || state.rates.length === 0) throw new Error('No shipping rates were returned for this cart.');
    state.quote = Shipping.createCheckoutShippingQuote(state.rateRequest, state.packaging, state.rates);
    renderPackaging(); renderRates(); show('shipping-section');
  } catch (cause) { error(userFacingError(cause, 'Packaging or rates could not be calculated.')); }
  finally { setBusy(button, false); }
});

function renderPackaging() {
  const boxes = state.packaging.boxes;
  $('#packaging').innerHTML = `<div class="allowance-note">Protective allowance is applied to every item dimension. Maximum box weight: 30 kg.</div>${boxes.map((box, index) => `<article class="box-card"><div><small>PACKAGE ${index + 1}</small><h3>${html(box.catalogBoxName || `Box ${index + 1}`)}</h3><p>${html(box.dimensions.length)} × ${html(box.dimensions.width)} × ${html(box.dimensions.height)} cm · ${Number(box.totalWeight).toFixed(2)} kg</p></div><ul>${box.items.map((item) => `<li>${html(item.itemName)} × ${html(item.quantity)} <span>${Number(item.totalWeight).toFixed(2)} kg</span></li>`).join('')}</ul></article>`).join('')}`;
}

function renderRates() {
  state.selectedRate = null; $('#rate-button').disabled = true;
  $('#rates').innerHTML = `<div class="rates-title"><h3>Select shipment carrier</h3><span>STEP 1/2</span></div>${state.rates.map((rate, index) => `<label class="rate-card"><input type="radio" name="rate" value="${index}"><span class="carrier-name"><i aria-hidden="true">A</i><strong>${html(rate.name)}</strong></span><span class="rate-availability"><small>Available</small><b>${html(money(rate.payment_amount, rate.others.currency))}</b></span><span class="transit"><small>Estimated transit time</small><strong>${html(rate.others.min_day)}–${html(rate.others.max_day)} business days</strong></span><span class="select-copy">Select</span></label>`).join('')}`;
  document.querySelectorAll('input[name="rate"]').forEach((input) => input.addEventListener('change', () => { state.selectedRate = state.rates[Number(input.value)]; state.selection = Shipping.selectCheckoutRate(state.quote, state.selectedRate.slug); state.payment = null; state.purchaseIntent = null; state.externalReference = null; state.purchaseState = 'idle'; $('#rate-button').disabled = false; }));
}

$('#rate-button').addEventListener('click', () => { renderOrderSummary(); show('payment-section'); });
function renderOrderSummary() {
  const totals = cartTotals(state.lines); const shipping = shippingAmount(state.selectedRate); const currency = state.selectedRate.others.currency;
  $('#order-summary').innerHTML = `<h3>Order summary</h3><div class="summary-row"><span>Products (${totals.quantity})</span><strong>${html(money(totals.subtotal, currency))}</strong></div><div class="summary-row"><span>${html(state.selectedRate.name)} shipping</span><strong>${html(money(shipping, currency))}</strong></div><div class="summary-row total"><span>Total</span><strong>${html(money(totals.subtotal + shipping, currency))}</strong></div>`;
}

$('#pay-button').addEventListener('click', async (event) => {
  const button = event.currentTarget; setBusy(button, true, 'Processing PayDemo…'); error();
  try {
    if (state.purchaseState === 'uncertain') throw new Error('The previous purchase result is uncertain. Reconcile the existing external reference before retrying.');
    const totals = cartTotals(state.lines); const orderAmount = totals.subtotal + state.selection.shippingCost;
    state.payment = payDemoResult($('#payment-outcome').value, { amount: orderAmount, currency: state.selection.currency });
    if (!state.payment.confirmed) throw new Error(`PayDemo payment was ${state.payment.status}. The shipment was not purchased.`);
    const prepared = Shipping.preparePurchaseRequest(state.rateRequest, {
      assignedDate: minimumAssignedDate(), externalReference: state.externalReference ??= `PAYDEMO-${crypto.randomUUID?.() ?? Date.now()}`,
      rate: state.selectedRate, shipmentMethodSlug: state.selectedRate.slug, fileIsUrl: 1,
    });
    if (!prepared.success) throw new Error(prepared.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
    state.purchaseIntent ??= Shipping.createCheckoutPurchaseIntent(prepared.request, state.selection);
    state.purchaseState = 'submitting';
    // PayDemo confirms the full merchandise + delivery total. Africanies only owns
    // the shipping portion, so the SDK confirmation binds that same host payment
    // reference to the immutable shipping intent and its selected delivery amount.
    const response = await Shipping.purchaseAfterPayment(state.client, state.purchaseIntent, { confirmed: true, reference: state.payment.id, confirmedAt: new Date().toISOString(), intentId: state.purchaseIntent.id, amount: state.purchaseIntent.amount, currency: state.purchaseIntent.currency });
    state.purchaseState = 'purchased'; renderResult(response.data); show('result-section');
  } catch (cause) {
    if (state.purchaseState === 'submitting') state.purchaseState = isDefinitivePurchaseFailure(cause) ? 'failed' : 'uncertain';
    const reconciliation = state.purchaseState === 'uncertain' ? ` The result is uncertain. Reconcile external reference ${state.externalReference} before retrying.` : '';
    error(`${cause instanceof Error ? cause.message : 'Payment or shipment purchase failed.'}${reconciliation}`);
  }
  finally { setBusy(button, false); }
});

function isDefinitivePurchaseFailure(cause) {
  if (!(cause instanceof Shipping.AfricaniesError)) return false;
  if (cause.category === 'validation') return true;
  return [400, 401, 403, 404, 422, 424].includes(cause.status);
}
function safeUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
const MAX_BASE64_DOCUMENT_BYTES = 10 * 1024 * 1024;
function base64Url(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return { error: 'Malformed Base64 document' };
  if (value.length > Math.ceil(MAX_BASE64_DOCUMENT_BYTES / 3) * 4) return { error: 'Base64 document exceeds the 10 MB browser download limit' };
  try { const decoded = atob(value); if (decoded.length > MAX_BASE64_DOCUMENT_BYTES) return { error: 'Base64 document exceeds the 10 MB browser download limit' }; const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); state.documentUrls.push(url); return { url }; } catch { return { error: 'Malformed Base64 document' }; }
}
function documentCard(label, value, isUrl, required = false, notRequested = false) {
  if (notRequested) return `<div class="document-card unavailable"><span>—</span><strong>${label}</strong><small>Not requested</small></div>`;
  const href = isUrl === 1 ? safeUrl(value) : null;
  if (href) return `<a class="document-card" href="${href}" target="_blank" rel="noopener noreferrer"><span>PDF</span><strong>${label}</strong><small>Open document ↗</small></a>`;
  const decoded = isUrl === 0 && typeof value === 'string' && value ? base64Url(value) : null;
  if (decoded?.url) return `<a class="document-card" href="${decoded.url}" download="${label.toLowerCase().replaceAll(' ', '-')}.pdf"><span>PDF</span><strong>${label}</strong><small>Download Base64 document</small></a>`;
  if (decoded?.error) return `<div class="document-card unavailable"><span>!</span><strong>${label}</strong><small>${decoded.error}</small></div>`;
  return `<div class="document-card unavailable"><span>—</span><strong>${label}</strong><small>${required ? 'Required document unavailable' : 'Not returned'}</small></div>`;
}
function renderResult(result) {
  state.documentUrls.forEach((url) => URL.revokeObjectURL(url)); state.documentUrls = [];
  const tracking = safeUrl(result.tracking_url);
  $('#shipment-result').innerHTML = `<div class="tracking-card"><div><small>REFERENCE</small><strong>${html(result.reference)}</strong></div><div><small>TRACKING NUMBER</small><strong>${html(result.tracking_number)}</strong></div>${tracking ? `<a class="primary button-link" href="${html(tracking)}" target="_blank" rel="noopener noreferrer">Track shipment</a>` : ''}</div><div class="panel payment-record"><small>PAYDEMO FULL ORDER + DELIVERY PAYMENT</small><strong>${html(state.payment.id)}</strong><span>${html(money(state.payment.amount, state.payment.currency))} · Confirmed</span></div><h3>Shipment documents</h3><div class="documents">${documentCard('Waybill', result.documents.waybill_doc, result.waybill_is_url)}${documentCard('Commercial invoice', result.documents.invoice_doc, result.invoice_is_url, true)}${documentCard('Insurance certificate', result.documents.insurance_doc, result.insurance_is_url, state.rateRequest?.is_insured === '1', state.rateRequest?.is_insured !== '1')}</div>`;
}

renderCatalog();
