import { AfricaniesError, categoryForStatus, redactUrl } from './errors.js';
import type { ApiEnvelope, ShipmentMode } from './types.js';

export type HttpMethod = 'GET' | 'POST';

export interface TransportRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  shipmentMode?: ShipmentMode;
}

export interface AfricaniesTransport {
  request<T>(request: TransportRequest): Promise<ApiEnvelope<T>>;
}

export interface FetchTransportOptions {
  baseUrl: string;
  authorization: string;
  shipmentMode?: ShipmentMode;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

function validateSecureBaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new AfricaniesError('baseUrl must be an absolute HTTP(S) URL.', {
      category: 'configuration', cause,
    });
  }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AfricaniesError('baseUrl must use HTTPS (HTTP is allowed only for localhost).', {
      category: 'configuration',
    });
  }
}

interface RequestSignal {
  signal: AbortSignal;
  timedOut(): boolean;
  cleanup(): void;
}

function createRequestSignal(signal: AbortSignal | undefined, timeoutMs: number): RequestSignal {
  const controller = new AbortController();
  let timeoutReached = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });

  const timeout = globalThis.setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    cleanup() {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function requestAbortError(requestSignal: RequestSignal, cause: unknown): AfricaniesError | undefined {
  const isAbortException = cause instanceof DOMException && cause.name === 'AbortError';
  if (!requestSignal.signal.aborted && !isAbortException) return undefined;
  const timedOut = requestSignal.timedOut();
  return new AfricaniesError(timedOut ? 'The request timed out.' : 'The request was aborted.', {
    category: timedOut ? 'timeout' : 'aborted',
    cause,
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.success === 'boolean' &&
    typeof record.status_code === 'number' &&
    typeof record.message === 'string' &&
    'data' in record
  );
}

export function createFetchTransport(options: FetchTransportOptions): AfricaniesTransport {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') {
    throw new AfricaniesError('A fetch implementation is required.', { category: 'configuration' });
  }
  validateSecureBaseUrl(options.baseUrl);
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 30_000;

  return {
    async request<T>(request: TransportRequest): Promise<ApiEnvelope<T>> {
      const url = `${baseUrl}${request.path.startsWith('/') ? request.path : `/${request.path}`}`;
      const headers = new Headers({
        Authorization: options.authorization,
        'Content-Type': 'application/json',
      });
      const shipmentMode = request.shipmentMode ?? options.shipmentMode;
      if (shipmentMode) headers.set('X-Shipment-Mode', shipmentMode);

      const requestSignal = createRequestSignal(request.signal, timeoutMs);
      let response: Response;
      let payload: unknown;
      try {
        try {
          response = await fetchImplementation(url, {
            method: request.method,
            headers,
            signal: requestSignal.signal,
            ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
          });
        } catch (cause) {
          const abortError = requestAbortError(requestSignal, cause);
          if (abortError) throw abortError;
          throw new AfricaniesError(`Network request failed for ${redactUrl(url)}.`, {
            category: 'network',
            cause,
          });
        }

        try {
          payload = await response.json();
        } catch (cause) {
          const abortError = requestAbortError(requestSignal, cause);
          if (abortError) throw abortError;
          throw new AfricaniesError('AfricanIES returned a malformed JSON response.', {
            category: 'api',
            status: response.status,
            cause,
          });
        }
      } finally {
        requestSignal.cleanup();
      }

      if (!isEnvelope(payload)) {
        throw new AfricaniesError('AfricanIES returned an invalid response envelope.', {
          category: 'api',
          status: response.status,
          data: payload,
        });
      }

      if (!response.ok || !payload.success) {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        throw new AfricaniesError(payload.message || 'AfricanIES request failed.', {
          category: categoryForStatus(response.status),
          status: response.status,
          apiStatusCode: payload.status_code,
          data: payload.data,
          ...(retryAfter === undefined ? {} : { retryAfter }),
        });
      }

      return payload as ApiEnvelope<T>;
    },
  };
}
