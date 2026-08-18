import { describe, expect, it } from 'vitest';
import { AfricaniesError, resolveAuthorization } from '../src/index.js';

describe('resolveAuthorization', () => {
  it('passes an encoded key through without encoding it again', () => {
    expect(resolveAuthorization({ encodedKey: ' cHViOnByaXY= ' })).toBe('cHViOnByaXY=');
  });

  it('encodes raw public and private keys', () => {
    expect(resolveAuthorization({ publicKey: 'public', privateKey: 'private' })).toBe(
      'cHVibGljOnByaXZhdGU=',
    );
  });

  it('rejects empty credentials', () => {
    expect(() => resolveAuthorization({ encodedKey: ' ' })).toThrow(AfricaniesError);
  });
});
