import { describe, expect, it } from 'vitest';
import { canonicalStringify, hashInputs, hashPayload } from './hashing.js';

describe('hashing utilities', () => {
  it('produces stable hash for objects regardless of key order', () => {
    const first = hashPayload({ a: 1, b: { c: 2 } });
    const second = hashPayload({ b: { c: 2 }, a: 1 });
    expect(first.hash).toBe(second.hash);
    expect(first.canonical).toBe(second.canonical);
  });

  it('serializes numbers consistently', () => {
    const one = hashPayload(1);
    const onePointZero = hashPayload(1.0);
    expect(one.hash).toBe(onePointZero.hash);
    expect(one.canonical).toBe('1');
  });

  it('handles arrays and nested payloads', () => {
    const result = hashPayload([1, 'two', { three: true }]);
    expect(result.canonical).toBe('[1,"two",{"three":true}]');
  });

  it('hashes input ids deterministically', () => {
    const hashA = hashInputs(['b', 'a', 'c']);
    const hashB = hashInputs(['c', 'b', 'a']);
    expect(hashA).toBe(hashB);
  });

  it('canonicalizes NaN and Infinity safely', () => {
    const nan = hashPayload(Number.NaN);
    const inf = hashPayload(Number.POSITIVE_INFINITY);
    expect(nan.canonical).toBe('"NaN"');
    expect(inf.canonical).toBe('"Infinity"');
  });

  it('canonical stringify mirrors hash payload canonical output', () => {
    const payload = { z: 2, a: [1, 2] };
    const { canonical } = hashPayload(payload);
    expect(canonical).toBe(canonicalStringify(payload));
  });
});
