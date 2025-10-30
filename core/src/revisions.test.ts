import { describe, expect, it } from 'vitest';
import { nextRevisionId } from './revisions.js';

describe('nextRevisionId', () => {
  it('increments numeric revision suffix', () => {
    expect(nextRevisionId('rev-0001')).toBe('rev-0002');
    expect(nextRevisionId('rev-0099')).toBe('rev-0100');
  });

  it('defaults to rev-0001 when current is nullish', () => {
    expect(nextRevisionId(null)).toBe('rev-0001');
    expect(nextRevisionId(undefined)).toBe('rev-0001');
  });

  it('handles malformed revision ids gracefully', () => {
    expect(nextRevisionId('rev-alpha' as unknown as `rev-${string}`)).toBe('rev-0001');
  });
});
