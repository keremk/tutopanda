import { describe, expect, it } from 'vitest';
import { InputValuesSchema } from './input-values.js';

describe('InputValuesSchema', () => {
  it('accepts valid payloads', () => {
    const result = InputValuesSchema.parse({
      InquiryPrompt: 'Hello world',
      Duration: 45,
      SegmentNarrationInput: ['Line 1', 'Line 2'],
      UseVideo: false,
      ImagesPerSegment: 2,
    });
    expect(result.Duration).toBe(45);
    expect(result.SegmentNarrationInput?.length).toBe(2);
  });

  it('rejects unknown keys', () => {
    expect(() =>
      InputValuesSchema.parse({ UnknownKey: 'value' } as Record<string, unknown>),
    ).toThrow();
  });

  it('rejects invalid types', () => {
    expect(() =>
      InputValuesSchema.parse({ Duration: 'long' } as Record<string, unknown>),
    ).toThrow();
  });
});
