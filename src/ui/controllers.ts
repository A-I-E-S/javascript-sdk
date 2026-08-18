import type { AfricaniesClient, UploadedFile } from '../client.js';
import { AfricaniesError } from '../errors.js';
import type {
  ApiEnvelope,
  ShipmentPurchaseRequest,
  ShipmentRateDraft,
  ShipmentPurchaseResult,
  ShipmentRate,
  ShipmentRateRequest,
  UploadFileDescriptor,
} from '../types.js';
import { completeRateRequest, validatePurchaseRequest, validateRateRequest, type ValidationIssue } from './validation.js';

export type Unsubscribe = () => void;

class ObservableState<T> {
  #state: T;
  readonly #listeners = new Set<(state: T) => void>();

  constructor(initialState: T) {
    this.#state = initialState;
  }

  get state(): T {
    return this.#state;
  }

  protected setState(next: T): void {
    this.#state = next;
    for (const listener of this.#listeners) listener(next);
  }

  subscribe(listener: (state: T) => void): Unsubscribe {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }
}

export interface BuilderState {
  draft: ShipmentRateDraft;
  issues: ValidationIssue[];
  valid: boolean;
}

export class ShipmentBuilderController extends ObservableState<BuilderState> {
  readonly #client: AfricaniesClient;

  constructor(client: AfricaniesClient, initialValue: ShipmentRateDraft) {
    super({ draft: initialValue, issues: [], valid: false });
    this.#client = client;
    this.validate();
  }

  get client(): AfricaniesClient {
    return this.#client;
  }

  replace(draft: ShipmentRateDraft): void {
    this.setState({ ...this.state, draft });
    this.validate();
  }

  validate(): boolean {
    const result = validateRateRequest(this.state.draft, this.#client.shipmentMode);
    this.setState({ ...this.state, valid: result.valid, issues: result.issues });
    return result.valid;
  }

  complete(): ShipmentRateRequest {
    if (!this.validate()) {
      throw new AfricaniesError('Shipment builder contains invalid fields.', {
        category: 'validation',
        data: this.state.issues,
      });
    }
    return completeRateRequest(this.state.draft);
  }
}

export type RateSelectionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface RateSelectionState {
  status: RateSelectionStatus;
  request: ShipmentRateRequest;
  rates: ShipmentRate[];
  selectedSlug: string | null;
  error: AfricaniesError | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumeric(value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function isShipmentRate(value: unknown): value is ShipmentRate {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.slug !== 'string') return false;
  if (typeof value.mode !== 'string' || !isRecord(value.others) || !isRecord(value.charges)) return false;
  if (typeof value.others.min_day !== 'string'
    || typeof value.others.max_day !== 'string'
    || typeof value.others.currency !== 'string') return false;
  for (const field of ['total_amount', 'discount_amount', 'payment_amount', 'total_item_value'] as const) {
    if (!isFiniteNumeric(value[field])) return false;
  }
  for (const field of ['shipment_cost', 'insurance_cost', 'pickup_cost', 'last_mile_delivery_cost'] as const) {
    if (!isFiniteNumeric(value.charges[field])) return false;
  }
  return value.charges.vat === undefined
    || value.charges.vat === null
    || isFiniteNumeric(value.charges.vat);
}

export class RateSelectionController extends ObservableState<RateSelectionState> {
  readonly #client: AfricaniesClient;
  #abortController?: AbortController;
  #loadId = 0;

  constructor(client: AfricaniesClient, request: ShipmentRateRequest) {
    super({ status: 'idle', request, rates: [], selectedSlug: null, error: null });
    this.#client = client;
  }

  async load(): Promise<ShipmentRate[]> {
    this.#abortController?.abort();
    const abortController = new AbortController();
    const loadId = ++this.#loadId;
    this.#abortController = abortController;
    this.setState({ ...this.state, status: 'loading', rates: [], selectedSlug: null, error: null });
    let response: ApiEnvelope<ShipmentRate[]>;
    try {
      response = await this.#client.shipments.getRates(
        this.state.request,
        abortController.signal,
      );
    } catch (error) {
      const normalized =
        error instanceof AfricaniesError
          ? error
          : new AfricaniesError('Unable to load shipment rates.', { category: 'network', cause: error });
      if (loadId === this.#loadId) {
        this.setState({ ...this.state, status: 'error', error: normalized, rates: [] });
      }
      throw normalized;
    }
    if (!Array.isArray(response.data) || !response.data.every(isShipmentRate)) {
      const invalidResponse = new AfricaniesError('AfricanIES returned invalid shipment rate data.', {
        category: 'api',
        data: response.data,
      });
      if (loadId === this.#loadId) {
        this.setState({ ...this.state, status: 'error', error: invalidResponse, rates: [] });
      }
      throw invalidResponse;
    }
    if (loadId !== this.#loadId) return response.data;
    this.setState({
      ...this.state,
      status: response.data.length === 0 ? 'empty' : 'ready',
      rates: response.data,
    });
    return response.data;
  }

  select(slug: string): ShipmentRate {
    const selected = this.state.rates.find((rate) => rate.slug === slug);
    if (!selected) {
      throw new AfricaniesError('Select a rate returned by the current request.', {
        category: 'validation',
      });
    }
    this.setState({ ...this.state, selectedSlug: slug });
    return selected;
  }

  cancel(): void {
    this.#loadId += 1;
    this.#abortController?.abort();
  }
}

export type PurchaseStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface PurchaseState {
  status: PurchaseStatus;
  request: ShipmentPurchaseRequest;
  response: ApiEnvelope<ShipmentPurchaseResult> | null;
  error: AfricaniesError | null;
  issues: ValidationIssue[];
}

export class PurchaseController extends ObservableState<PurchaseState> {
  readonly #client: AfricaniesClient;
  #inFlight: Promise<ApiEnvelope<ShipmentPurchaseResult>> | undefined;

  constructor(client: AfricaniesClient, request: ShipmentPurchaseRequest) {
    super({ status: 'idle', request, response: null, error: null, issues: [] });
    this.#client = client;
  }

  submit(signal?: AbortSignal): Promise<ApiEnvelope<ShipmentPurchaseResult>> {
    if (this.state.response) return Promise.resolve(this.state.response);
    if (this.#inFlight) return this.#inFlight;
    const validation = validatePurchaseRequest(this.state.request, this.#client.shipmentMode);
    if (!validation.valid) {
      this.setState({ ...this.state, issues: validation.issues });
      return Promise.reject(
        new AfricaniesError('Purchase request contains invalid fields.', {
          category: 'validation',
          data: validation.issues,
        }),
      );
    }

    this.setState({ ...this.state, status: 'submitting', issues: [], error: null });
    this.#inFlight = this.#client.shipments.purchase(this.state.request, signal).then(
      (response) => {
        this.setState({ ...this.state, status: 'success', response, error: null });
        return response;
      },
      (error: unknown) => {
        const normalized =
          error instanceof AfricaniesError
            ? error
            : new AfricaniesError('Unable to purchase shipment.', { category: 'network', cause: error });
        this.setState({ ...this.state, status: 'error', error: normalized });
        throw normalized;
      },
    );
    void this.#inFlight.then(
      () => { this.#inFlight = undefined; },
      () => { this.#inFlight = undefined; },
    );
    return this.#inFlight;
  }
}

export type UploadStatus = 'selected' | 'uploading' | 'uploaded' | 'failed';

export interface UploadRecord {
  id: string;
  file: Blob;
  name: string;
  descriptor: UploadFileDescriptor;
  status: UploadStatus;
  progress: number;
  attempt: number;
  uploaded?: UploadedFile | undefined;
  error?: AfricaniesError | undefined;
}

export class UploadController extends ObservableState<readonly UploadRecord[]> {
  readonly #client: AfricaniesClient;
  readonly #abortControllers = new Map<string, AbortController>();

  constructor(client: AfricaniesClient) {
    super([]);
    this.#client = client;
  }

  add(file: Blob, descriptor: UploadFileDescriptor, name = 'upload'): UploadRecord {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const record: UploadRecord = {
      id,
      file,
      name,
      descriptor,
      status: 'selected',
      progress: 0,
      attempt: 0,
    };
    this.setState([...this.state, record]);
    void this.upload(id);
    return record;
  }

  async upload(id: string): Promise<UploadedFile> {
    const record = this.state.find((candidate) => candidate.id === id);
    if (!record) throw new AfricaniesError('Upload record was not found.', { category: 'validation' });
    this.#abortControllers.get(id)?.abort();
    const abortController = new AbortController();
    this.#abortControllers.set(id, abortController);
    this.update(id, { status: 'uploading', progress: 0, attempt: record.attempt + 1, error: undefined });
    try {
      const uploaded = await this.#client.files.upload(record.file, record.descriptor, {
        signal: abortController.signal,
      });
      if (this.#abortControllers.get(id) !== abortController) return uploaded;
      this.update(id, { status: 'uploaded', progress: 1, uploaded, error: undefined });
      return uploaded;
    } catch (error) {
      const normalized =
        error instanceof AfricaniesError
          ? error
          : new AfricaniesError('File upload failed.', { category: 'upload', cause: error });
      if (this.#abortControllers.get(id) === abortController) {
        this.update(id, { status: 'failed', progress: 0, error: normalized });
      }
      throw normalized;
    } finally {
      if (this.#abortControllers.get(id) === abortController) this.#abortControllers.delete(id);
    }
  }

  retry(id: string): Promise<UploadedFile> {
    return this.upload(id);
  }

  remove(id: string): void {
    this.#abortControllers.get(id)?.abort();
    this.#abortControllers.delete(id);
    this.setState(this.state.filter((record) => record.id !== id));
  }

  private update(id: string, patch: Partial<UploadRecord>): void {
    this.setState(
      this.state.map((record) => (record.id === id ? { ...record, ...patch } : record)),
    );
  }
}
