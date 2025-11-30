/* eslint-env node */
import { describe, expect, it } from 'vitest';
import { runGenerate } from './generate.js';

describe('query command migration', () => {
  it('exposes generation through runGenerate', () => {
    expect(typeof runGenerate).toBe('function');
  });
});
