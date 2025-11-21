import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ExecutionPlan, InputEvent } from 'tutopanda-core';
import { confirmPlanExecution } from './interactive-confirm.js';

const mockClose = vi.fn();

vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_prompt: string, callback: (answer: string) => void) => {
      callback('y');
    },
    close: mockClose,
  }),
}));

function createPlan(): ExecutionPlan {
  return {
    revision: 'rev-0001',
    manifestBaseHash: 'base-hash',
    layers: [
      [
        {
          jobId: 'job-1',
          producer: 'ScriptProducer',
          inputs: [],
          produces: [],
          provider: 'openai',
          providerModel: 'gpt-5-mini',
          rateKey: 'openai:gpt-5-mini',
        },
      ],
    ],
    createdAt: new Date().toISOString(),
  };
}

function createInputs(): InputEvent[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'InquiryPrompt',
      revision: 'rev-0001',
      hash: 'hash-a',
      payload: 'Tell me a story',
      editedBy: 'user',
      createdAt: now,
    },
    {
      id: 'NumOfSegments',
      revision: 'rev-0001',
      hash: 'hash-b',
      payload: 3,
      editedBy: 'user',
      createdAt: now,
    },
  ];
}

describe('confirmPlanExecution', () => {
  beforeEach(() => {
    mockClose.mockClear();
  });

  it('displays input summary before prompting for confirmation', async () => {
    const infoSpy = vi.fn();
    const logger = {
      info: infoSpy,
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    await confirmPlanExecution(createPlan(), { inputs: createInputs(), logger });
    const logs = infoSpy.mock.calls.map((call) => call[0]);
    expect(logs.find((line) => typeof line === 'string' && line.includes('Input Summary'))).toBeDefined();
    expect(
      logs.find((line) => typeof line === 'string' && line.includes('InquiryPrompt: Tell me a story')),
    ).toBeDefined();
    expect(logs.find((line) => typeof line === 'string' && line.includes('NumOfSegments: 3'))).toBeDefined();
  });
});
