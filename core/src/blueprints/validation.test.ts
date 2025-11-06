import { describe, it, expect } from 'vitest';
import { validateBlueprint } from './validation.js';
import { composeBlueprint } from './port-composer.js';
import { scriptSection, audioSection } from './index.js';
import type { SectionConnection, BlueprintSection } from '../types.js';
import { inputRef, artifactRef } from './helpers.js';

describe('validateBlueprint', () => {
  it('should error if required input is not connected', () => {
    const sections = [scriptSection, audioSection];
    const connections: SectionConnection[] = [];
    const sectionMap = new Map(sections.map((s) => [s.id, s]));

    const { blueprint } = composeBlueprint(sections, connections, { validate: false });
    const result = validateBlueprint(blueprint, sectionMap, connections);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.type === 'required_input_missing')).toBe(true);
  });

  it('should detect circular dependencies', () => {
    // Create artificial cycle for testing
    const cycleSection: BlueprintSection = {
      id: 'cycle',
      label: 'Cycle Test',
      nodes: [
        {
          ref: inputRef('InquiryPrompt'),
          cardinality: 'single',
        },
        {
          ref: artifactRef('MovieTitle'),
          cardinality: 'single',
        },
      ],
      edges: [],
      inputs: [
        {
          name: 'input',
          ref: inputRef('InquiryPrompt'),
          cardinality: 'single',
          required: true,
        },
      ],
      outputs: [
        {
          name: 'output',
          ref: artifactRef('MovieTitle'),
          cardinality: 'single',
          required: true,
        },
      ],
    };

    const sections = [cycleSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'cycle', port: 'output' },
        to: { section: 'cycle', port: 'input' },
      },
    ];

    expect(() => composeBlueprint(sections, connections)).toThrow(/Circular dependency/);
  });

  it('should warn about unused outputs', () => {
    const sections = [scriptSection, audioSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'script', port: 'narrationScript' },
        to: { section: 'audio', port: 'narrationScript' },
      },
    ];

    const sectionMap = new Map(sections.map((s) => [s.id, s]));
    const { blueprint } = composeBlueprint(sections, connections, { validate: false });
    const result = validateBlueprint(blueprint, sectionMap, connections);

    // audio.segmentAudio is not connected
    expect(result.warnings.some((w) => w.type === 'unused_output')).toBe(true);
  });

  it('should error when required artifact inputs are not connected', () => {
    const sections = [audioSection]; // Audio only
    const connections: SectionConnection[] = [];
    const sectionMap = new Map(sections.map((s) => [s.id, s]));

    const { blueprint } = composeBlueprint(sections, connections, { validate: false });
    const result = validateBlueprint(blueprint, sectionMap, connections);

    // audio has a required artifact input (narrationScript) which isn't connected
    // voiceId is a user input (InputSource) so it doesn't need a connection
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].type).toBe('required_input_missing');
    expect(result.errors[0].port).toBe('narrationScript');
  });
});
