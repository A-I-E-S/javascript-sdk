import {
  AfricaniesError,
  createAfricaniesClient,
  defineAfricaniesElements,
  preparePurchaseRequest,
} from '@africanies/shipping/browser';
import './styles.css';
import {
  completePreparedPurchaseRequest,
  isAssignedDateValid,
  legacyPurchaseRequestForPresentation,
  minimumAssignedDate,
  normalizeCompletedRateRequest,
  sampleRateDraft,
} from './demo-state.js';

defineAfricaniesElements();

const setupForm = document.querySelector('#setup-form');
const environmentInput = document.querySelector('#environment');
const shipmentModeInput = document.querySelector('#shipment-mode');
const encodedKeyInput = document.querySelector('#encoded-key');
const externalReferenceInput = document.querySelector('#external-reference');
const assignedDateInput = document.querySelector('#assigned-date');
const liveConfirmation = document.querySelector('#live-confirmation');
const confirmLiveInput = document.querySelector('#confirm-live');
const startButton = document.querySelector('#start-button');
const resetButton = document.querySelector('#reset-button');
const safetyBanner = document.querySelector('#safety-banner');
const flowTitle = document.querySelector('#flow-title');
const statusRegion = document.querySelector('#app-status');
const errorRegion = document.querySelector('#app-error');
const workspace = document.querySelector('#workspace');
const backActions = document.querySelector('#back-actions');

let client;
let completedRateRequest;
let selectedRate;
const externalReference = newExternalReference();
const localEncodedKey = import.meta.env.VITE_AFRICANIES_ENCODED_KEY?.trim() ?? '';

function newExternalReference() {
  const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `SDK-DEMO-${unique}`;
}

function setError(message = '') {
  errorRegion.textContent = message;
  errorRegion.hidden = message === '';
  if (message) errorRegion.focus();
}

function setStatus(message) {
  statusRegion.textContent = message;
}

function resetAssignedDate() {
  const minimum = minimumAssignedDate();
  assignedDateInput.min = minimum;
  assignedDateInput.value = minimum;
  assignedDateInput.setCustomValidity('');
}

function validateAssignedDate() {
  const minimum = minimumAssignedDate();
  assignedDateInput.min = minimum;
  if (isAssignedDateValid(assignedDateInput.value, minimum)) {
    assignedDateInput.setCustomValidity('');
    return true;
  }
  const message = `Assigned date must be after today. Choose ${minimum} or later.`;
  assignedDateInput.disabled = false;
  assignedDateInput.setCustomValidity(message);
  setError(message);
  assignedDateInput.focus();
  return false;
}

function setBackAction(label, action) {
  backActions.replaceChildren();
  if (!label) return;
  const button = document.createElement('button');
  button.className = 'secondary compact';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  backActions.append(button);
}

function setConfigurationLocked(locked) {
  for (const control of setupForm.elements) {
    if (control !== resetButton) control.disabled = locked;
  }
}

function updateSafetyUi() {
  const live = environmentInput.value === 'live';
  liveConfirmation.hidden = !live;
  if (!live) confirmLiveInput.checked = false;
  safetyBanner.className = `safety ${live ? 'live' : 'test'}`;
  safetyBanner.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = live ? 'LIVE MODE' : 'TEST MODE';
  const description = document.createElement('span');
  description.textContent = live
    ? 'Requests use api.africanies.com and may create real shipments.'
    : 'Requests use api-sandbox.africaniestest.com.';
  safetyBanner.append(title, description);
  startButton.textContent = live ? 'Start LIVE shipment' : 'Start test shipment';
}

function showBuilder(draft) {
  setError();
  flowTitle.textContent = '1. Build shipment';
  setStatus('Complete the sender, receiver, package, and item fields.');
  setBackAction('', undefined);
  const builder = document.createElement('africanies-shipment-builder');
  builder.client = client;
  builder.value = draft ?? sampleRateDraft(client.shipmentMode);
  builder.addEventListener('africanies-complete', (event) => {
    completedRateRequest = normalizeCompletedRateRequest(event.detail, client.shipmentMode);
    showRates();
  }, { once: true });
  workspace.replaceChildren(builder);
}

function showRates() {
  setError();
  flowTitle.textContent = '2. Select a rate';
  setStatus('AfricanIES is loading the available services for this shipment.');
  setBackAction('Back to shipment', () => showBuilder(completedRateRequest));
  const rates = document.createElement('africanies-rate-selection');
  rates.client = client;
  rates.request = completedRateRequest;
  rates.addEventListener('africanies-rate-selected', () => {
    setStatus('Rate selected. Continue when you are ready.');
  });
  rates.addEventListener('africanies-complete', (event) => {
    selectedRate = event.detail.rate;
    preparePurchase();
  });
  workspace.replaceChildren(rates);
}

function preparationMessage(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join(' ');
}

function preparePurchase() {
  setError();
  if (!validateAssignedDate()) return;
  const prepared = preparePurchaseRequest(completedRateRequest, {
    assignedDate: assignedDateInput.value,
    externalReference: externalReferenceInput.value.trim(),
    rate: selectedRate,
    shipmentMethodSlug: selectedRate.slug,
  });
  if (!prepared.success) {
    setError(`Purchase could not be prepared. ${preparationMessage(prepared.issues)}`);
    return;
  }
  const needsLegacyPurchaseValidation = prepared.request.currency === undefined;

  let purchaseRequest;
  try {
    purchaseRequest = completePreparedPurchaseRequest(
      prepared.request,
      selectedRate,
      client.shipmentMode,
    );
  } catch (error) {
    setError(error instanceof Error ? error.message : 'The selected rate does not match this shipment mode.');
    return;
  }

  if (client.environment === 'live') {
    showLivePurchaseGate(purchaseRequest, needsLegacyPurchaseValidation);
    return;
  }
  showPurchase(purchaseRequest, needsLegacyPurchaseValidation);
}

function showLivePurchaseGate(request, needsLegacyPurchaseValidation) {
  flowTitle.textContent = 'Confirm live purchase';
  setStatus('A second explicit confirmation is required before the live purchase screen is enabled.');
  setBackAction('Back to rates', showRates);
  const gate = document.createElement('div');
  gate.className = 'live-gate';
  const heading = document.createElement('h3');
  heading.textContent = 'You are about to use the LIVE API';
  const message = document.createElement('p');
  message.textContent = `External reference ${externalReferenceInput.value.trim()} may create a real shipment. After the purchase request is sent, Back or Reset cannot revoke it.`;
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'danger-button';
  confirm.textContent = 'I confirm: continue to LIVE purchase';
  confirm.addEventListener('click', () => showPurchase(request, needsLegacyPurchaseValidation), { once: true });
  gate.append(heading, message, confirm);
  workspace.replaceChildren(gate);
  confirm.focus();
}

function showPurchase(request, needsLegacyPurchaseValidation = false) {
  setError();
  flowTitle.textContent = '3. Purchase shipment';
  setStatus(client.environment === 'live'
    ? 'LIVE MODE: review the reference and use the purchase button only when ready.'
    : 'Review the reference, method, boxes, and date before purchasing.');
  setBackAction('Back to rates', showRates);
  const purchase = document.createElement('africanies-purchase-confirmation');
  if (needsLegacyPurchaseValidation && client.shipmentMode === 'STN') {
    const canonicalRequest = request;
    purchase.client = {
      ...client,
      shipments: {
        ...client.shipments,
        purchase: (_legacyRequest, signal) => client.shipments.purchase(canonicalRequest, signal),
      },
    };
    purchase.request = legacyPurchaseRequestForPresentation(request, client.shipmentMode);
  } else {
    purchase.client = client;
    purchase.request = request;
  }
  purchase.addEventListener('africanies-purchased', () => {
    setStatus('Shipment purchased. Keep the displayed reference and documents.');
    setBackAction('', undefined);
  }, { once: true });
  purchase.addEventListener('africanies-error', (event) => {
    const error = event.detail;
    const status = error instanceof AfricaniesError && error.status ? ` HTTP ${error.status}.` : '';
    const assignedDateMessages = error instanceof AfricaniesError
      && error.data && typeof error.data === 'object'
      && Array.isArray(error.data.assigned_date)
      ? error.data.assigned_date.filter((message) => typeof message === 'string')
      : [];
    const detail = assignedDateMessages.length > 0
      ? ` ${assignedDateMessages.join(' ')} Choose a valid date, then select Back to rates and Continue again. This does not resubmit automatically.`
      : ` ${error instanceof Error ? error.message : 'Review the response shown below.'}`;
    setError(`Purchase failed.${status}${detail}`);
    if (assignedDateMessages.length > 0) {
      assignedDateInput.disabled = false;
      assignedDateInput.setCustomValidity(assignedDateMessages.join(' '));
      setStatus('Purchase was not completed. Correct the assigned date, then return to rates and explicitly continue again.');
      assignedDateInput.focus();
    }
  });
  workspace.replaceChildren(purchase);
}

function resetFlow() {
  client = undefined;
  completedRateRequest = undefined;
  selectedRate = undefined;
  encodedKeyInput.value = localEncodedKey;
  environmentInput.value = 'test';
  shipmentModeInput.value = 'SFN';
  confirmLiveInput.checked = false;
  resetAssignedDate();
  externalReferenceInput.value = externalReference;
  setConfigurationLocked(false);
  updateSafetyUi();
  setError();
  setStatus('Enter your runtime configuration to begin.');
  flowTitle.textContent = 'Ready to begin';
  setBackAction('', undefined);
  workspace.replaceChildren();
  encodedKeyInput.focus();
}

environmentInput.addEventListener('change', updateSafetyUi);

setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  setError();
  const environment = environmentInput.value;
  if (environment === 'live' && !confirmLiveInput.checked) {
    setError('Confirm that you understand LIVE mode before continuing.');
    confirmLiveInput.focus();
    return;
  }
  const encodedKey = encodedKeyInput.value.trim();
  if (!encodedKey) {
    setError('Enter the Base64 encoded key.');
    encodedKeyInput.focus();
    return;
  }
  if (!validateAssignedDate()) return;

  try {
    client = createAfricaniesClient({
      environment,
      shipmentMode: shipmentModeInput.value,
      auth: { encodedKey },
    });
  } catch (error) {
    setError(error instanceof Error ? error.message : 'The SDK configuration is invalid.');
    return;
  }

  encodedKeyInput.value = '';
  setConfigurationLocked(true);
  showBuilder();
});

resetButton.addEventListener('click', resetFlow);

assignedDateInput.addEventListener('input', () => assignedDateInput.setCustomValidity(''));

resetAssignedDate();
encodedKeyInput.value = localEncodedKey;
externalReferenceInput.value = externalReference;
updateSafetyUi();
