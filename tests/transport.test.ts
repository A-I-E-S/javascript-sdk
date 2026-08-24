import { describe, expect, it, vi } from 'vitest';
import { AfricaniesError, createAfricaniesClient, createFetchTransport } from '../src/index.js';
import { purchaseRequest } from './fixtures.js';

describe('fetch transport', () => {
  it('rejects insecure remote base URLs before exposing authorization to fetch', () => {
    const fetchMock = vi.fn();
    expect(() => createFetchTransport({
      baseUrl: 'http://api.example.test/api/v1', authorization: 'must-not-leak',
      shipmentMode: 'SFN', fetch: fetchMock as typeof fetch,
    })).toThrowError(/must use HTTPS/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the approved API headers', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, status_code: 200, message: 'ok', data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const transport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1',
      authorization: 'secret',
      shipmentMode: 'SFN',
      fetch: fetchMock as typeof fetch,
    });

    await transport.request({ method: 'POST', path: '/shipment/rates', body: { boxes: [] } });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.test/api/v1/shipment/rates');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('secret');
    expect(headers.get('X-Shipment-Mode')).toBe('SFN');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('X-Account-Number')).toBe(false);

    await transport.request({ method: 'POST', path: '/shipment/purchase', shipmentMode: 'STN', body: {} });
    const overriddenHeaders = new Headers(fetchMock.mock.calls[1]![1]?.headers);
    expect(overriddenHeaders.get('X-Shipment-Mode')).toBe('STN');
  });

  it('serializes optional purchase flags unchanged in the JSON body', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, status_code: 200, message: 'ok', data: {} }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    const client = createAfricaniesClient({
      shipmentMode: 'SFN', auth: { encodedKey: 'secret' },
      baseUrl: 'https://example.test', fetch: fetchMock as typeof fetch,
    });
    const request = purchaseRequest();
    request.is_insured = '1';
    request.file_is_url = 1;
    await client.shipments.purchase(request);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.test/api/v1/shipment/purchase');
    expect(JSON.parse(String(init?.body))).toMatchObject({ is_insured: '1', file_is_url: 1 });
  });

  it('turns API failures into typed errors without exposing authorization', async () => {
    const transport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1', authorization: 'do-not-leak', shipmentMode: 'STN',
      fetch: (async () => new Response(JSON.stringify({
        success: false, status_code: 422, message: 'Validation failed', data: { boxes: ['required'] },
      }), { status: 422 })) as typeof fetch,
    });
    await expect(transport.request({ method: 'POST', path: '/shipment/rates' })).rejects.toMatchObject({
      name: 'AfricaniesError', category: 'validation', status: 422, apiStatusCode: 422,
    });
  });

  it('rejects malformed envelopes', async () => {
    const transport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1', authorization: 'secret', shipmentMode: 'SFN',
      fetch: (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch,
    });
    await expect(transport.request({ method: 'GET', path: '/warehouse' })).rejects.toBeInstanceOf(
      AfricaniesError,
    );
  });

  it('reports timeout separately from a caller abort', async () => {
    const fetchUntilAbort = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
    const transport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1',
      authorization: 'secret',
      shipmentMode: 'SFN',
      fetch: fetchUntilAbort,
      timeoutMs: 5,
    });

    await expect(transport.request({ method: 'GET', path: '/warehouse' })).rejects.toMatchObject({
      category: 'timeout',
    });
  });

  it('keeps timeout and caller cancellation active while reading the response body', async () => {
    const fetchWithSlowBody = (async (_input: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
    }) as Response) as typeof fetch;
    const timedTransport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1', authorization: 'secret', shipmentMode: 'SFN',
      fetch: fetchWithSlowBody, timeoutMs: 5,
    });
    await expect(timedTransport.request({ method: 'GET', path: '/warehouse' })).rejects.toMatchObject({
      category: 'timeout',
    });

    const controller = new AbortController();
    const abortableTransport = createFetchTransport({
      baseUrl: 'https://example.test/api/v1', authorization: 'secret', shipmentMode: 'SFN',
      fetch: fetchWithSlowBody, timeoutMs: 5_000,
    });
    const request = abortableTransport.request({
      method: 'GET', path: '/warehouse', signal: controller.signal,
    });
    controller.abort(new Error('consumer cancellation'));
    await expect(request).rejects.toMatchObject({ category: 'aborted' });
  });
});
