import { describe, it, expect } from 'vitest';
import { normalizeToTokenList } from '@/services/tokenListService';

const TOKEN = { chainId: 42161, address: '0xabc', symbol: 'X', name: 'X Token', decimals: 18 };

describe('normalizeToTokenList', () => {
  it('wraps a bare array into a TokenList', () => {
    const result = normalizeToTokenList([TOKEN]);
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.tokens)).toBe(true);
    expect(result!.tokens).toHaveLength(1);
    expect(result!.version).toEqual({ major: 1, minor: 0, patch: 0 });
    expect(typeof result!.name).toBe('string');
  });

  it('passes a valid token-list object through unchanged', () => {
    const obj = { name: 'L', version: { major: 2, minor: 1, patch: 0 }, tokens: [TOKEN] } as any;
    expect(normalizeToTokenList(obj)).toBe(obj);
  });

  it('returns null for unusable input', () => {
    expect(normalizeToTokenList(null)).toBeNull();
    expect(normalizeToTokenList({ foo: 'bar' })).toBeNull();
  });
});
