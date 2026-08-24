import { resolveAuthorization, type AfricaniesAuth } from './auth.js';
import { AfricaniesError, redactUrl } from './errors.js';
import { createFetchTransport, type AfricaniesTransport } from './transport.js';
import { assertShipmentRequest } from './shipment-validation.js';
import type {
  AddressVerifyRequest,
  AddressVerifyResult,
  AfricaniesEnvironment,
  ApiEnvelope,
  Carrier,
  GeneratedUpload,
  ListResult,
  ProductHsCode,
  ProductVerification,
  ResourceSelector,
  ShipmentMode,
  ShipmentPurchaseRequest,
  ShipmentPurchaseResult,
  ShipmentRate,
  ShipmentRateRequest,
  TrackingResult,
  UploadFileDescriptor,
  Warehouse,
} from './types.js';

export const AFRICANIES_ENVIRONMENTS = {
  test: 'https://api-sandbox.africaniestest.com',
  live: 'https://api.africanies.com',
} as const satisfies Record<AfricaniesEnvironment, string>;

export interface AfricaniesClientConfig {
  environment?: AfricaniesEnvironment;
  shipmentMode: ShipmentMode;
  auth?: AfricaniesAuth;
  baseUrl?: string;
  transport?: AfricaniesTransport;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface UploadOptions {
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}

export interface UploadedFile extends GeneratedUpload {
  descriptor: UploadFileDescriptor;
}

export interface AfricaniesClient {
  readonly environment: AfricaniesEnvironment;
  readonly shipmentMode: ShipmentMode;
  readonly addresses: {
    verify(request: AddressVerifyRequest, signal?: AbortSignal): Promise<ApiEnvelope<AddressVerifyResult>>;
  };
  readonly files: {
    generateUploadUrls(
      request: { files: UploadFileDescriptor[] },
      signal?: AbortSignal,
    ): Promise<ApiEnvelope<GeneratedUpload[]>>;
    upload(
      file: Blob,
      descriptor: UploadFileDescriptor,
      options?: UploadOptions,
    ): Promise<UploadedFile>;
  };
  readonly products: {
    search(value: string, signal?: AbortSignal): Promise<ApiEnvelope<ProductHsCode[]>>;
    verify(request: { hs_code: string }, signal?: AbortSignal): Promise<ApiEnvelope<ProductVerification>>;
    list(signal?: AbortSignal): Promise<ApiEnvelope<ListResult<ProductHsCode>>>;
    get(id: ResourceSelector, signal?: AbortSignal): Promise<ApiEnvelope<ListResult<ProductHsCode>>>;
  };
  readonly shipments: {
    getRates(request: ShipmentRateRequest, signal?: AbortSignal): Promise<ApiEnvelope<ShipmentRate[]>>;
    purchase(
      request: ShipmentPurchaseRequest,
      signal?: AbortSignal,
    ): Promise<ApiEnvelope<ShipmentPurchaseResult>>;
    track(trackingNumber: string, signal?: AbortSignal): Promise<ApiEnvelope<TrackingResult>>;
  };
  readonly carriers: {
    list(signal?: AbortSignal): Promise<ApiEnvelope<ListResult<Carrier>>>;
    get(id: ResourceSelector, signal?: AbortSignal): Promise<ApiEnvelope<ListResult<Carrier>>>;
  };
  readonly warehouses: {
    list(signal?: AbortSignal): Promise<ApiEnvelope<ListResult<Warehouse>>>;
    get(id: ResourceSelector, signal?: AbortSignal): Promise<ApiEnvelope<ListResult<Warehouse>>>;
    listByCountry(country: string, signal?: AbortSignal): Promise<ApiEnvelope<Warehouse[]>>;
  };
}

function nonEmptyPath(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AfricaniesError(`${label} must not be empty.`, { category: 'validation' });
  }
  return encodeURIComponent(normalized);
}

function selectorPath(base: string, selector?: ResourceSelector): string {
  if (selector === undefined) return base;
  if (selector !== 'all' && (!Number.isInteger(selector) || selector <= 0)) {
    throw new AfricaniesError('Resource id must be a positive integer or "all".', {
      category: 'validation',
    });
  }
  return `${base}/${selector}`;
}

function normalizeBaseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new AfricaniesError('baseUrl must be an absolute HTTP(S) URL.', {
      category: 'configuration',
      cause,
    });
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AfricaniesError('baseUrl must use HTTPS (HTTP is allowed only for localhost).', {
      category: 'configuration',
    });
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function validateSecureUploadUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new AfricaniesError('AfricanIES returned an invalid signed upload URL.', {
      category: 'upload', cause,
    });
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AfricaniesError(
      `Signed upload URL must use HTTPS (HTTP is allowed only for localhost): ${redactUrl(value)}.`,
      { category: 'upload' },
    );
  }
}

function validateEnvironment(value: unknown): asserts value is AfricaniesEnvironment {
  if (value !== 'test' && value !== 'live') {
    throw new AfricaniesError('environment must be either "test" or "live".', {
      category: 'configuration',
    });
  }
}

function validateShipmentMode(value: unknown): asserts value is ShipmentMode {
  if (value !== 'SFN' && value !== 'STN') {
    throw new AfricaniesError('shipmentMode must be either "SFN" or "STN".', {
      category: 'configuration',
    });
  }
}

function validateOfficialEnvironmentOrigin(
  baseUrl: string,
  environment: AfricaniesEnvironment,
): void {
  const actualOrigin = new URL(baseUrl).origin;
  const otherEnvironment: AfricaniesEnvironment = environment === 'test' ? 'live' : 'test';
  if (actualOrigin === AFRICANIES_ENVIRONMENTS[otherEnvironment]) {
    throw new AfricaniesError(
      `baseUrl points to the ${otherEnvironment} API but environment is set to ${environment}.`,
      { category: 'configuration' },
    );
  }
}

export function createAfricaniesClient(config: AfricaniesClientConfig): AfricaniesClient {
  const environment = config.environment ?? 'test';
  validateEnvironment(environment);
  validateShipmentMode(config.shipmentMode);
  const baseOrigin = normalizeBaseOrigin(config.baseUrl ?? AFRICANIES_ENVIRONMENTS[environment]);
  validateOfficialEnvironmentOrigin(baseOrigin, environment);
  const baseUrl = baseOrigin.endsWith('/api/v1') ? baseOrigin : `${baseOrigin}/api/v1`;
  const transport =
    config.transport ??
    createFetchTransport({
      baseUrl,
      authorization: resolveAuthorization(
        config.auth ??
          (() => {
            throw new AfricaniesError('auth is required when transport is not supplied.', {
              category: 'configuration',
            });
          })(),
      ),
      shipmentMode: config.shipmentMode,
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    });

  const request = <T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal) =>
    transport.request<T>({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...(signal ? { signal } : {}),
    });

  return {
    environment,
    shipmentMode: config.shipmentMode,
    addresses: {
      verify: (body, signal) => request('POST', '/address/verify', body, signal),
    },
    files: {
      generateUploadUrls: (body, signal) => request('POST', '/file/generate', body, signal),
      async upload(file, descriptor, options = {}) {
        const generated = await request<GeneratedUpload[]>(
          'POST',
          '/file/generate',
          { files: [descriptor] },
          options.signal,
        );
        const target = generated.data[0];
        if (!target) {
          throw new AfricaniesError('AfricanIES did not return a signed upload URL.', {
            category: 'upload',
          });
        }
        validateSecureUploadUrl(target.upload_url);
        const fetchImplementation = options.fetch ?? config.fetch ?? globalThis.fetch;
        try {
          const response = await fetchImplementation(target.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': descriptor.mime_type },
            body: file,
            ...(options.signal ? { signal: options.signal } : {}),
          });
          if (!response.ok) {
            throw new AfricaniesError(
              `S3 upload failed with status ${response.status} for ${redactUrl(target.upload_url)}.`,
              { category: 'upload', status: response.status },
            );
          }
        } catch (cause) {
          if (cause instanceof AfricaniesError) throw cause;
          throw new AfricaniesError(`S3 upload failed for ${redactUrl(target.upload_url)}.`, {
            category: 'upload',
            cause,
          });
        }
        return { ...target, descriptor };
      },
    },
    products: {
      search: (value, signal) =>
        request('GET', `/product/search/${nonEmptyPath(value, 'Search value')}`, undefined, signal),
      verify: (body, signal) => request('POST', '/product/verify', body, signal),
      list: (signal) => request('GET', '/product', undefined, signal),
      get: (id, signal) => request('GET', selectorPath('/product', id), undefined, signal),
    },
    shipments: {
      getRates: async (body, signal) => { assertShipmentRequest(body, config.shipmentMode, 'rate'); return request('POST', '/shipment/rates', body, signal); },
      purchase: async (body, signal) => { assertShipmentRequest(body, config.shipmentMode, 'purchase'); return request('POST', '/shipment/purchase', body, signal); },
      track: (trackingNumber, signal) =>
        request(
          'POST',
          `/shipment/track/${nonEmptyPath(trackingNumber, 'Tracking number')}`,
          undefined,
          signal,
        ),
    },
    carriers: {
      list: (signal) => request('GET', '/shipment/carriers', undefined, signal),
      get: (id, signal) => request('GET', selectorPath('/shipment/carriers', id), undefined, signal),
    },
    warehouses: {
      list: (signal) => request('GET', '/warehouse', undefined, signal),
      get: (id, signal) => request('GET', selectorPath('/warehouse', id), undefined, signal),
      listByCountry: (country, signal) =>
        request(
          'GET',
          `/warehouse/country/${nonEmptyPath(country, 'Country')}`,
          undefined,
          signal,
        ),
    },
  };
}
