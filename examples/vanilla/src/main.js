import * as Shipping from '@africanies/shipping/browser';
import './tailwind.css';
import { mountSharedRates, mountSharedPayDemo } from './shared-checkout-ui.js';
import { mountSharedShipmentResult } from './shared-shipment-result.js';
import {
  DEMO_COUNTRIES, DEMO_PRODUCTS, WAREHOUSE_ADDRESS, cartLines, cartTotals, createPackagingInput,
  receiverFromForm, shippingAmount, minimumAssignedDate, payDemoResult,
} from './demo-state.js';

const $ = (selector) => document.querySelector(selector);
const money = (value, currency = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(Number(value));
const html = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const state = { client: null, cart: {}, classifications: {}, productSearches: {}, lines: [], packaging: null, rateRequest: null, rates: [], quote: null, selection: null, selectedRate: null, payment: null, purchaseIntent: null, externalReference: null, purchaseState: 'idle', resultView: null };

function populateReceiverStates(selected='') { const country=DEMO_COUNTRIES.find((entry)=>entry.code===$('#receiver-country').value); const stateSelect=$('#receiver-state'); stateSelect.innerHTML=`<option value="">Select state</option>${(country?.states??[]).map((entry)=>`<option value="${entry.code}">${html(entry.name)}</option>`).join('')}`; stateSelect.disabled=!country?.states?.length; stateSelect.value=selected; }
function populateReceiverCountries() { const country=$('#receiver-country'); country.innerHTML=`<option value="">Select country</option>${DEMO_COUNTRIES.map((entry)=>`<option value="${entry.code}">${html(entry.name)}</option>`).join('')}`; country.value='US'; populateReceiverStates('MA'); }

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

function resetSession() {
  Object.keys(state.productSearches).forEach(cancelProductSearch);
  state.client = null; state.cart = {}; state.classifications = {}; state.productSearches = {}; state.lines = [];
  state.packaging = null; state.rateRequest = null; state.rates = []; state.quote = null; state.selection = null;
  state.selectedRate = null; state.payment = null; state.purchaseIntent = null; state.externalReference = null; state.purchaseState = 'idle';
  state.resultView?.dispose(); state.resultView = null;
  $('#encoded-key').value = ''; $('#login-status').textContent = ''; $('#login-status').className = 'message';
  $('#address-form').reset(); $('#cart-count').textContent = '0'; $('#authenticated-actions').hidden = true;
  $('#store-view').hidden = true; $('#login-view').hidden = false; error(); renderCatalog(); updateCheckoutState(); $('#encoded-key').focus();
}

function renderCatalog() {
  $('#catalog').innerHTML = DEMO_PRODUCTS.map((product) => `<article class="product-card">
    <div class="product-art ${product.id}" aria-hidden="true">${product.name.slice(0, 1)}</div>
    <div class="product-copy"><small>PRODUCT CLASSIFICATION REQUIRED</small><h3>${product.name}</h3><p>${product.description}</p>
    <dl><div><dt>Unit weight</dt><dd>${product.weight} kg</dd></div><div><dt>Size</dt><dd>${product.dimensions.length} × ${product.dimensions.width} × ${product.dimensions.height} cm</dd></div></dl>
    <div class="classification"><label>Find product classification<input role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="product-list-${product.id}" data-product-search="${product.id}" value="${product.name}" aria-describedby="product-status-${product.id}" autocomplete="off"></label><ul id="product-list-${product.id}" class="product-options" role="listbox" data-product-results="${product.id}" hidden></ul><div data-product-selection="${product.id}"></div><p id="product-status-${product.id}" data-product-status="${product.id}" role="status" aria-live="polite">Type at least 3 characters. Search starts automatically.</p></div>
    <div class="product-action"><strong>${money(product.price)}</strong><label>Qty <input class="quantity" data-product="${product.id}" type="number" min="0" max="20" step="1" value="${state.cart[product.id] ?? 0}"></label></div></div></article>`).join('');
  document.querySelectorAll('.quantity').forEach((input) => input.addEventListener('input', () => {
    state.cart[input.dataset.product] = Math.max(0, Number(input.value)); state.lines = cartLines(state.cart);
    updateCheckoutState();
  }));
  document.querySelectorAll('[data-product-search]').forEach((input) => { input.addEventListener('input', () => scheduleProductSearch(input.dataset.productSearch)); input.addEventListener('keydown', productKeydown); });
  document.querySelectorAll('[data-product-results]').forEach((list) => list.addEventListener('click', (event) => { const option=event.target.closest('[data-product-option]'); if(option)selectClassification(list.dataset.productResults,Number(option.dataset.index)); }));
}

function updateCheckoutState() {
  state.packaging = null; state.rateRequest = null; state.rates = []; state.quote = null; state.selection = null; state.selectedRate = null; state.payment = null; state.purchaseIntent = null; state.externalReference = null; state.purchaseState = 'idle';
  const totals = cartTotals(state.lines); $('#cart-count').textContent = totals.quantity;
  $('#checkout-button').disabled = totals.quantity === 0 || state.lines.some((line) => !state.classifications[line.id]);
}

function cancelProductSearch(productId) {
  const active = state.productSearches[productId]; if (!active) return;
  clearTimeout(active.timer); active.controller?.abort(); delete state.productSearches[productId];
}

function scheduleProductSearch(productId) {
  cancelProductSearch(productId); delete state.classifications[productId]; updateCheckoutState();
  const query = $(`[data-product-search="${productId}"]`).value.trim(); const status = $(`[data-product-status="${productId}"]`); const select = $(`[data-product-results="${productId}"]`);
  select.hidden = true; select.replaceChildren(); $(`[data-product-selection="${productId}"]`).replaceChildren(); const input=$(`[data-product-search="${productId}"]`); input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant');
  if (query.length < 3) { status.textContent = 'Type at least 3 characters to search.'; return; }
  status.textContent = 'Waiting to search…';
  const timer = setTimeout(() => {
    delete state.productSearches[productId]; void startProductSearch(productId);
  }, 350); state.productSearches[productId] = { timer };
}

async function startProductSearch(productId) {
  const query = $(`[data-product-search="${productId}"]`).value.trim(); const status = $(`[data-product-status="${productId}"]`);
  cancelProductSearch(productId); const controller = new AbortController(); const search = { controller }; state.productSearches[productId] = search;
  delete state.classifications[productId]; updateCheckoutState();
  if (query.length < 3) { delete state.productSearches[productId]; status.textContent = 'Type at least 3 characters to search.'; return; }
  status.textContent = 'Searching Africanies products…';
  try {
    const client = state.client; const response = await client.products.search(query, controller.signal);
    if (state.productSearches[productId] !== search || state.client !== client) return;
    const results = Array.isArray(response.data) ? response.data : [];
    state.productSearches[productId].results=results; state.productSearches[productId].active=0;
    if (!results.length) { status.textContent='No matching products found. Try a broader description.'; return; }
    const list = $(`[data-product-results="${productId}"]`); list.innerHTML = results.map((item,index) => `<li id="product-${productId}-option-${index}" role="option" aria-selected="${index===0}" data-product-option data-index="${index}"><strong>${html(item.name)}</strong><small>HS ${html(item.hs_code)}</small></li>`).join('');
    list.hidden = false; const input=$(`[data-product-search="${productId}"]`); input.setAttribute('aria-expanded','true'); input.setAttribute('aria-activedescendant',`product-${productId}-option-0`); status.textContent = `${results.length} matching classifications found.`;
  } catch (cause) { if (state.productSearches[productId] === search && !controller.signal.aborted) status.textContent = cause instanceof Error ? cause.message : 'Product search failed.'; }
  finally { if (state.productSearches[productId] === search && !search.results) delete state.productSearches[productId]; }
}

function selectClassification(productId,index){ const search=state.productSearches[productId]; const product=search?.results?.[index]; if(!product)return; state.classifications[productId]=product; const input=$(`[data-product-search="${productId}"]`); input.value=product.name; input.setAttribute('aria-expanded','false'); input.removeAttribute('aria-activedescendant'); $(`[data-product-results="${productId}"]`).hidden=true; $(`[data-product-selection="${productId}"]`).innerHTML=`<div class="classification-selection"><span>${html(product.name)} · HS ${html(product.hs_code)}</span><button type="button" class="secondary" data-clear-product="${productId}">Clear</button></div>`; $(`[data-clear-product="${productId}"]`).addEventListener('click',()=>{cancelProductSearch(productId);delete state.classifications[productId];input.value='';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');$(`[data-product-results="${productId}"]`).hidden=true;$(`[data-product-selection="${productId}"]`).replaceChildren();$(`[data-product-status="${productId}"]`).textContent='Type at least 3 characters to search.';updateCheckoutState();input.focus();}); $(`[data-product-status="${productId}"]`).textContent=`Selected ${product.name} · HS ${product.hs_code}`; updateCheckoutState(); }
function productKeydown(event){const input=event.currentTarget, id=input.dataset.productSearch, search=state.productSearches[id], results=search?.results??[]; if(event.key==='Escape'){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');$(`[data-product-results="${id}"]`).hidden=true;return;} if(!results.length)return; if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();search.active=(search.active+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;const list=$(`[data-product-results="${id}"]`);list.hidden=false;input.setAttribute('aria-expanded','true');list.querySelectorAll('[role="option"]').forEach((option,index)=>option.setAttribute('aria-selected',String(index===search.active)));input.setAttribute('aria-activedescendant',`product-${id}-option-${search.active}`);}else if(event.key==='Enter'&&input.getAttribute('aria-expanded')==='true'){event.preventDefault();selectClassification(id,search.active??0);}}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter; const status = $('#login-status'); const encodedKey = $('#encoded-key').value.trim();
  state.client = null;
  status.className = 'message'; status.textContent = 'Checking credential with Africanies sandbox…'; setBusy(button, true, 'Checking…');
  try {
    // This compulsorily-SFN demo keeps a legacy hint so the addressless credential ping carries its mode.
    const client = Shipping.createAfricaniesClient({ environment: 'test', shipmentMode: 'SFN', auth: { encodedKey } });
    const response = await client.carriers.list();
    if (!response?.success) throw new Error(response?.message || 'Credential check was not accepted.');
    state.client = client; $('#encoded-key').value = ''; $('#login-view').hidden = true; $('#store-view').hidden = false; $('#authenticated-actions').hidden = false; renderCatalog(); show('catalog-section');
  } catch (cause) { status.className = 'message failure'; status.textContent = cause instanceof Error ? cause.message : 'Could not validate this credential.'; }
  finally { $('#encoded-key').value = ''; if (!state.client) $('#store-view').hidden = true; setBusy(button, false); }
});

$('#logout-button').addEventListener('click', resetSession);

$('#receiver-country').addEventListener('change',()=>populateReceiverStates());
populateReceiverCountries();

$('#checkout-button').addEventListener('click', () => show('address-section'));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => show(button.dataset.back)));

$('#address-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.submitter ?? event.currentTarget.querySelector('[type="submit"]'); setBusy(button, true, 'Packaging and loading rates…');
  try {
    const calculatePackaging = Shipping.calculatePackaging;
    if (typeof calculatePackaging !== 'function') throw new Error('This SDK build does not yet include automatic packaging. Install the expanded-stabilization build.');
    const packagingInput = createPackagingInput(state.lines, state.classifications);
    state.packaging = calculatePackaging(packagingInput.items, packagingInput.settings);
    const receiver = receiverFromForm(event.currentTarget);
    state.rateRequest = Shipping.buildRateRequestFromPackaging({
      addresses: { sender: { ...WAREHOUSE_ADDRESS }, receiver }, packaging: state.packaging,
      isInsured: $('#insured').checked ? '1' : '0',
    });
    renderPackaging();show('shipping-section');mountSharedRates($('#rates'),{loading:true});
    const response = await state.client.shipments.getRates(state.rateRequest);
    state.rates = response.data; if (!Array.isArray(state.rates) || state.rates.length === 0) throw new Error('No shipping rates were returned for this cart.');
    state.quote = Shipping.createCheckoutShippingQuote(state.rateRequest, state.packaging, state.rates);
    renderRates();
  } catch (cause) { const message=userFacingError(cause, 'Packaging or rates could not be calculated.');if(state.rateRequest){show('shipping-section');mountSharedRates($('#rates'),{error:message,onRefresh:()=>$('#address-form').requestSubmit()});}error(message); }
  finally { setBusy(button, false); }
});

function renderPackaging() {
  const boxes = state.packaging.boxes;
  $('#packaging').innerHTML = `<div class="allowance-note">A +1 cm protective allowance is applied to every item axis before fitting. The SDK chooses the smallest configured box that safely fits the adjusted items, respecting the 30 kg maximum.</div>${boxes.map((box, index) => `<article class="box-card"><div><small>SELECTED PACKAGE ${index + 1}</small><h3>${html(box.catalogBoxName || `Box ${index + 1}`)}</h3><p>${html(box.dimensions.length)} × ${html(box.dimensions.width)} × ${html(box.dimensions.height)} cm · ${Number(box.totalWeight).toFixed(2)} kg</p><small>Smallest safe catalog fit after per-axis allowance${box.items.length > 1 ? ' and combined packing' : ''}.</small></div><ul>${box.items.map((item) => `<li>${html(item.itemName)} × ${html(item.quantity)} <span>${Number(item.totalWeight).toFixed(2)} kg</span></li>`).join('')}</ul></article>`).join('')}`;
}

function renderRates() {
  state.selectedRate = null;
  mountSharedRates($('#rates'),{rates:state.rates,onRefresh:()=>$('#address-form').requestSubmit(),onSelect:(rate)=>{state.selectedRate=rate;state.selection=Shipping.selectCheckoutRate(state.quote,rate.slug);state.payment=null;state.purchaseIntent=null;state.externalReference=null;state.purchaseState='idle';},onContinue:()=>{state.externalReference??=`PAYDEMO-${crypto.randomUUID?.()??Date.now()}`;renderOrderSummary();show('payment-section');}});
}

function renderOrderSummary() {
  const totals = cartTotals(state.lines); const shipping = shippingAmount(state.selectedRate); const currency = state.selectedRate.others.currency;
  const insurance = state.rateRequest?.is_insured === '1' ? Number(state.selectedRate.charges.insurance_cost ?? 0) : 0;
  mountSharedPayDemo($('#payment-section'),{reference:state.externalReference,carrier:state.selectedRate.name,merchandise:totals.subtotal,shipping,insurance,insured:state.rateRequest?.is_insured==='1',currency,onBack:()=>show('shipping-section'),onSubmit:purchaseAutomatic});
  $('#payment-section .payment-context').id='payment-context';$('#payment-section .order-summary').id='order-summary';$('#payment-section .shared-payment-outcome').id='payment-outcome';$('#payment-section .shared-pay-button').id='pay-button';$('#payment-section .shared-payment-status').id='payment-status';
}

async function purchaseAutomatic({outcome,button,status}) {
  setBusy(button, true, 'Processing PayDemo…'); error();
  status.textContent = 'PayDemo is simulating the full order and delivery payment…'; status.className = 'message shared-payment-status processing';
  try {
    if (state.purchaseState === 'uncertain') throw new Error('The previous purchase result is uncertain. Reconcile the existing external reference before retrying.');
    const totals = cartTotals(state.lines); const orderAmount = totals.subtotal + state.selection.shippingCost;
    state.payment = payDemoResult(outcome, { amount: orderAmount, currency: state.selection.currency });
    if (!state.payment.confirmed) throw new Error(`PayDemo payment was ${state.payment.status}. The shipment was not purchased.`);
    status.textContent = `Full payment approved · ${state.payment.id} · ${money(state.payment.amount, state.payment.currency)}`; status.className = 'message shared-payment-status success-message';
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
    state.purchaseState = 'purchased'; show('result-section'); renderResult(response.data);
  } catch (cause) {
    if (state.purchaseState === 'submitting') state.purchaseState = isDefinitivePurchaseFailure(cause) ? 'failed' : 'uncertain';
    const reconciliation = state.purchaseState === 'uncertain' ? ` The result is uncertain. Reconcile external reference ${state.externalReference} before retrying.` : '';
    const message = `${cause instanceof Error ? cause.message : 'Payment or shipment purchase failed.'}${reconciliation}`;
    status.textContent = message; status.className = 'message shared-payment-status failure'; error(message);
  }
  finally { setBusy(button, false); }
}

function isDefinitivePurchaseFailure(cause) {
  if (!(cause instanceof Shipping.AfricaniesError)) return false;
  if (cause.category === 'validation') return true;
  return [400, 401, 403, 404, 422, 424].includes(cause.status);
}
function renderResult(result) {
  const totals=cartTotals(state.lines); const delivery=state.selection.shippingCost; const insurance=state.rateRequest?.is_insured==='1'?Number(state.selectedRate.charges.insurance_cost??0):0;
  state.resultView?.dispose();
  state.resultView=mountSharedShipmentResult($('#result-section'),{shipment:{reference:result.reference,trackingNumber:result.tracking_number,trackingUrl:result.tracking_url},payment:{reference:state.payment.id,total:state.payment.amount,currency:state.payment.currency,merchandise:totals.subtotal,delivery,insurance,insured:state.rateRequest?.is_insured==='1',carrier:state.selectedRate.name,confirmedAt:state.payment.confirmedAt},documents:[{label:'Waybill',value:result.documents.waybill_doc,isUrl:result.waybill_is_url},{label:'Commercial invoice',value:result.documents.invoice_doc,isUrl:result.invoice_is_url,required:true},{label:'Insurance certificate',value:result.documents.insurance_doc,isUrl:result.insurance_is_url,required:state.rateRequest?.is_insured==='1',notRequested:state.rateRequest?.is_insured!=='1'}]});
}

renderCatalog();
