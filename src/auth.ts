import { AfricaniesError } from './errors.js';

export type RawCredentials = {
  publicKey: string;
  privateKey: string;
  encodedKey?: never;
};

export type EncodedCredentials = {
  encodedKey: string;
  publicKey?: never;
  privateKey?: never;
};

export type AfricaniesAuth = RawCredentials | EncodedCredentials;

function encodeBase64(value: string): string {
  if (typeof globalThis.btoa !== 'function') {
    throw new AfricaniesError('This runtime does not provide Base64 encoding.', {
      category: 'configuration',
    });
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export function resolveAuthorization(auth: AfricaniesAuth): string {
  if ('encodedKey' in auth) {
    const encodedKey = auth.encodedKey.trim();
    if (!encodedKey) {
      throw new AfricaniesError('encodedKey must not be empty.', { category: 'configuration' });
    }
    return encodedKey;
  }

  const publicKey = auth.publicKey.trim();
  const privateKey = auth.privateKey.trim();
  if (!publicKey || !privateKey) {
    throw new AfricaniesError('publicKey and privateKey must not be empty.', {
      category: 'configuration',
    });
  }
  return encodeBase64(`${publicKey}:${privateKey}`);
}
