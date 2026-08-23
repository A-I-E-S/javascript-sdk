import { describe, expect, it, vi } from 'vitest';
import { createAfricaniesClient, type AfricaniesTransport, type TransportRequest } from '../src/index.js';
import { rateRequest } from './fixtures.js';

function recordingTransport() {
  const requests: TransportRequest[] = [];
  const transport: AfricaniesTransport = {
    async request<T>(request: TransportRequest) {
      requests.push(request);
      return { success: true, status_code: 200, message: 'ok', data: [] as T };
    },
  };
  return { requests, transport };
}

describe('Africanies client resources', () => {
  it('uses test by default and builds exact resource paths', async () => {
    const { requests, transport } = recordingTransport();
    const client = createAfricaniesClient({ shipmentMode: 'SFN', transport });
    expect(client.environment).toBe('test');
    await client.shipments.getRates(rateRequest());
    await client.products.search('smart phone');
    await client.carriers.list();
    await client.carriers.get('all');
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'POST /shipment/rates',
      'GET /product/search/smart%20phone',
      'GET /shipment/carriers',
      'GET /shipment/carriers/all',
    ]);
  });

  it('rejects unsupported selectors', async () => {
    const { transport } = recordingTransport();
    const client = createAfricaniesClient({ shipmentMode: 'SFN', transport });
    expect(() => client.carriers.get(0)).toThrowError(/positive integer/);
  });

  it('requires secure absolute custom API origins except for local development', () => {
    expect(() => createAfricaniesClient({
      shipmentMode: 'SFN', auth: { encodedKey: 'key' }, baseUrl: 'api.example.test',
    })).toThrowError(/absolute HTTP/);
    expect(() => createAfricaniesClient({
      shipmentMode: 'SFN', auth: { encodedKey: 'key' }, baseUrl: 'http://api.example.test',
    })).toThrowError(/must use HTTPS/);
    expect(() => createAfricaniesClient({
      shipmentMode: 'SFN', auth: { encodedKey: 'key' }, baseUrl: 'http://localhost:8000',
    })).not.toThrow();
  });

  it('rejects runtime environment and shipment-mode configuration errors', () => {
    expect(() => createAfricaniesClient({
      shipmentMode: 'AIR' as never, transport: recordingTransport().transport,
    })).toThrowError(/shipmentMode/);
    expect(() => createAfricaniesClient({
      environment: 'sandbox' as never,
      shipmentMode: 'SFN',
      transport: recordingTransport().transport,
    })).toThrowError(/environment/);
  });

  it('rejects official API origins that contradict the selected environment', () => {
    expect(() => createAfricaniesClient({
      environment: 'test', shipmentMode: 'SFN', auth: { encodedKey: 'key' },
      baseUrl: 'https://api.africanies.com',
    })).toThrowError(/live API/);
    expect(() => createAfricaniesClient({
      environment: 'live', shipmentMode: 'SFN', auth: { encodedKey: 'key' },
      baseUrl: 'https://api-sandbox.africaniestest.com/api/v1',
    })).toThrowError(/test API/);
  });

  it('uploads raw bytes with PUT without forwarding Africanies headers', async () => {
    const transport: AfricaniesTransport = {
      async request<T>() {
        return { success: true, status_code: 200, message: 'ok', data: [{
          file_name: 'file-id', upload_url: 'https://bucket.s3.amazonaws.com/key?signature=secret', s3_key: 'documents/invoice/file.pdf',
        }] as T };
      },
    };
    const uploadFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 200 }),
    );
    const client = createAfricaniesClient({ shipmentMode: 'SFN', transport });
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const result = await client.files.upload(blob, {
      extension: 'pdf', mime_type: 'application/pdf', folder: 'documents/invoice',
    }, { fetch: uploadFetch as typeof fetch });
    const [url, init] = uploadFetch.mock.calls[0]!;
    expect(url).toContain('signature=secret');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(blob);
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/pdf');
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('X-Shipment-Mode')).toBe(false);
    expect(result.s3_key).toBe('documents/invoice/file.pdf');
  });

  it('rejects an insecure remote upload URL before sending file bytes', async () => {
    const transport: AfricaniesTransport = {
      async request<T>() {
        return { success: true, status_code: 200, message: 'ok', data: [{
          file_name: 'file-id', upload_url: 'http://bucket.example.test/key?signature=must-not-leak',
          s3_key: 'documents/invoice/file.pdf',
        }] as T };
      },
    };
    const uploadFetch = vi.fn();
    const client = createAfricaniesClient({ shipmentMode: 'SFN', transport });
    await expect(client.files.upload(new Blob(['sensitive']), {
      extension: 'pdf', mime_type: 'application/pdf', folder: 'documents/invoice',
    }, { fetch: uploadFetch as typeof fetch })).rejects.toMatchObject({
      category: 'upload', message: expect.not.stringContaining('signature=must-not-leak'),
    });
    expect(uploadFetch).not.toHaveBeenCalled();
  });
});
