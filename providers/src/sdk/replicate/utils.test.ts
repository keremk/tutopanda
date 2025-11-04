import { describe, expect, it } from 'vitest';
import { extractPlannerContext, mergeInputs, isRecord } from './utils.js';
import type { ProviderJobContext } from '../../types.js';

describe('extractPlannerContext', () => {
  it('extracts planner context from valid request', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              segment: 0,
              image: 1,
            },
            customField: 'value',
          },
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({
      index: {
        segment: 0,
        image: 1,
      },
      customField: 'value',
    });
  });

  it('returns empty object when extras is null', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: null,
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({});
  });

  it('returns empty object when extras is undefined', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: undefined,
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({});
  });

  it('returns empty object when plannerContext is missing', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          otherField: 'value',
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({});
  });

  it('returns empty object when plannerContext is not an object', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: 'not an object',
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({});
  });

  it('handles planner context with only segment index', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              segment: 5,
            },
          },
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({
      index: {
        segment: 5,
      },
    });
  });

  it('handles planner context with only image index', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              image: 2,
            },
          },
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({
      index: {
        image: 2,
      },
    });
  });

  it('handles planner context without index field', () => {
    const request: Partial<ProviderJobContext> = {
      context: {
        providerConfig: {},
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            someOtherField: 'value',
          },
        },
      },
    } as ProviderJobContext;

    const result = extractPlannerContext(request as ProviderJobContext);

    expect(result).toEqual({
      someOtherField: 'value',
    });
  });
});

describe('mergeInputs', () => {
  it('merges defaults with custom attributes', () => {
    const defaults = {
      temperature: 0.7,
      maxTokens: 100,
    };

    const customAttributes = {
      topP: 0.9,
      frequencyPenalty: 0.5,
    };

    const result = mergeInputs(defaults, customAttributes);

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.9,
      frequencyPenalty: 0.5,
    });
  });

  it('custom attributes override defaults', () => {
    const defaults = {
      temperature: 0.7,
      maxTokens: 100,
    };

    const customAttributes = {
      temperature: 0.9,
      topP: 0.95,
    };

    const result = mergeInputs(defaults, customAttributes);

    expect(result).toEqual({
      temperature: 0.9,
      maxTokens: 100,
      topP: 0.95,
    });
  });

  it('handles empty defaults', () => {
    const defaults = {};
    const customAttributes = {
      temperature: 0.8,
    };

    const result = mergeInputs(defaults, customAttributes);

    expect(result).toEqual({
      temperature: 0.8,
    });
  });

  it('handles undefined custom attributes', () => {
    const defaults = {
      temperature: 0.7,
      maxTokens: 100,
    };

    const result = mergeInputs(defaults, undefined);

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 100,
    });
  });

  it('handles both empty defaults and undefined custom attributes', () => {
    const result = mergeInputs({}, undefined);

    expect(result).toEqual({});
  });

  it('preserves all types of values', () => {
    const defaults = {
      stringValue: 'hello',
      numberValue: 42,
      booleanValue: true,
      nullValue: null,
      arrayValue: [1, 2, 3],
      objectValue: { nested: 'value' },
    };

    const customAttributes = {
      extraValue: 'world',
    };

    const result = mergeInputs(defaults, customAttributes);

    expect(result).toEqual({
      stringValue: 'hello',
      numberValue: 42,
      booleanValue: true,
      nullValue: null,
      arrayValue: [1, 2, 3],
      objectValue: { nested: 'value' },
      extraValue: 'world',
    });
  });

  it('custom attributes can override with different types', () => {
    const defaults = {
      value: 'string',
    };

    const customAttributes = {
      value: 123,
    };

    const result = mergeInputs(defaults, customAttributes);

    expect(result).toEqual({
      value: 123,
    });
  });
});

describe('isRecord', () => {
  it('returns true for plain object', () => {
    expect(isRecord({ key: 'value' })).toBe(true);
  });

  it('returns true for empty object', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns false for array', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isRecord([])).toBe(false);
  });

  it('returns false for string', () => {
    expect(isRecord('string')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isRecord(123)).toBe(false);
  });

  it('returns false for boolean', () => {
    expect(isRecord(true)).toBe(false);
  });

  it('returns false for function', () => {
    expect(isRecord(() => {})).toBe(false);
  });

  it('returns true for object with nested properties', () => {
    expect(
      isRecord({
        nested: {
          deeply: {
            value: 'test',
          },
        },
      }),
    ).toBe(true);
  });

  it('returns true for object created with Object.create', () => {
    expect(isRecord(Object.create(null))).toBe(true);
  });
});
