export type AfricaniesErrorCategory =
  | 'configuration'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'api'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'upload';

export interface AfricaniesErrorOptions {
  category: AfricaniesErrorCategory;
  status?: number;
  apiStatusCode?: number;
  data?: unknown;
  retryAfter?: number;
  cause?: unknown;
}

export class AfricaniesError extends Error {
  readonly category: AfricaniesErrorCategory;
  readonly status?: number;
  readonly apiStatusCode?: number;
  readonly data?: unknown;
  readonly retryAfter?: number;

  constructor(message: string, options: AfricaniesErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'AfricaniesError';
    this.category = options.category;
    if (options.status !== undefined) this.status = options.status;
    if (options.apiStatusCode !== undefined) this.apiStatusCode = options.apiStatusCode;
    if (options.data !== undefined) this.data = options.data;
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
  }
}

export function categoryForStatus(status: number): AfricaniesErrorCategory {
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate-limit';
  return 'api';
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split('?')[0] ?? value;
  }
}
