import { describe, expect, it } from 'vitest';
import { BuildPlanConfigSchema } from './config.js';

describe('BuildPlanConfigSchema', () => {
  it('parses a valid config', () => {
    const config = BuildPlanConfigSchema.parse({
      blueprint: {
        segmentCount: 2,
        imagesPerSegment: 1,
        useVideo: false,
        isImageToVideo: false,
      },
      inputs: {
        InquiryPrompt: 'Write a story',
        Duration: 60,
        SegmentNarrationInput: ['line one'],
        UseVideo: false,
        ImagesPerSegment: 1,
      },
    });
    expect(config.blueprint.segmentCount).toBe(2);
  });

  it('rejects invalid blueprint config', () => {
    expect(() =>
      BuildPlanConfigSchema.parse({
        blueprint: {
          segmentCount: 0,
          imagesPerSegment: 1,
          useVideo: false,
          isImageToVideo: false,
        },
        inputs: {},
      }),
    ).toThrow();
  });
});
