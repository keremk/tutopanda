import { describe, it, expect } from 'vitest';
import { composeBlueprint } from './port-composer.js';
import { scriptSection, audioSection } from './index.js';
import type { SectionConnection } from '../types.js';

describe('composeBlueprint', () => {
  it('should create connection edges from port connections', () => {
    const sections = [scriptSection, audioSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'script', port: 'narrationScript' },
        to: { section: 'audio', port: 'narrationScript' },
      },
    ];

    // Disable validation to test just the composition logic
    const { blueprint } = composeBlueprint(sections, connections, { validate: false });

    expect(blueprint.sections).toHaveLength(3); // script + audio + connections
    const connSection = blueprint.sections[2];
    expect(connSection.id).toBe('port-connections');
    expect(connSection.edges).toHaveLength(1);
  });

  it('should throw error for incompatible cardinality', () => {
    // Test perSegment → single (invalid)
    const sections = [audioSection, scriptSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'audio', port: 'segmentAudio' }, // perSegment
        to: { section: 'script', port: 'inquiryPrompt' },  // single
      },
    ];

    expect(() => composeBlueprint(sections, connections)).toThrow(/Incompatible cardinality/);
  });

  it('should auto-connect compatible ports when enabled', () => {
    const sections = [scriptSection, audioSection];
    const connections: SectionConnection[] = [];

    const { warnings } = composeBlueprint(sections, connections, {
      autoConnect: true,
      validate: false, // Disable validation to test auto-connect logic
    });

    // Should auto-connect script.narrationScript → audio.narrationScript
    expect(warnings.some((w) => w.type === 'auto_connected')).toBe(true);
  });

  it('should validate that sections have port definitions', () => {
    const sections = [
      {
        id: 'test',
        label: 'Test',
        nodes: [],
        edges: [],
        // No inputs or outputs
      },
    ];
    const connections: SectionConnection[] = [];

    expect(() => composeBlueprint(sections, connections)).toThrow(/does not have port definitions/);
  });

  it('should throw error for unknown section', () => {
    const sections = [scriptSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'unknown', port: 'output' },
        to: { section: 'script', port: 'inquiryPrompt' },
      },
    ];

    expect(() => composeBlueprint(sections, connections)).toThrow(/Unknown source section/);
  });

  it('should throw error for unknown port', () => {
    const sections = [scriptSection, audioSection];
    const connections: SectionConnection[] = [
      {
        from: { section: 'script', port: 'unknownPort' },
        to: { section: 'audio', port: 'narrationScript' },
      },
    ];

    expect(() => composeBlueprint(sections, connections)).toThrow(/does not have output port/);
  });
});
