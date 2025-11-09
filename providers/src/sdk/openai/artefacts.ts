import { Buffer } from 'node:buffer';
import type { ProducedArtefact, ArtefactEventStatus } from 'tutopanda-core';

type JsonObject = Record<string, unknown>;

export interface ParsedArtefactIdentifier {
  kind: string;
  index?: Record<string, number>;
}

/**
 * Builds artifacts from OpenAI response using implicit mapping.
 * Convention: camelCase JSON field → PascalCase Artifact ID
 *
 * @example
 * JSON response: { movieTitle: "...", narrationScript: ["seg1", "seg2", "seg3"] }
 * Produces:
 *   - "Artifact:MovieTitle" → movieTitle
 *   - "Artifact:NarrationScript[segment=0]" → narrationScript[0]
 *   - "Artifact:NarrationScript[segment=1]" → narrationScript[1]
 *   - "Artifact:NarrationScript[segment=2]" → narrationScript[2]
 */
export function buildArtefactsFromResponse(
  response: JsonObject | string,
  produces: string[],
): ProducedArtefact[] {
  const artefacts: ProducedArtefact[] = [];
  const jsonResponse = typeof response === 'string' ? response : response;

  for (const artefactId of produces) {
    const artefact = buildSingleArtefact(jsonResponse, artefactId);
    artefacts.push(artefact);
  }

  return artefacts;
}

function buildSingleArtefact(
  response: JsonObject | string,
  artefactId: string,
): ProducedArtefact {
  const diagnostics: Record<string, unknown> = {};

  // For text responses, return the whole text
  if (typeof response === 'string') {
    return {
      artefactId,
      status: 'succeeded',
      inline: response,
      diagnostics: { responseType: 'text' },
    };
  }

  // For JSON responses, use implicit mapping
  const parsed = parseArtefactIdentifier(artefactId);
  if (!parsed) {
    return {
      artefactId,
      status: 'failed',
      diagnostics: { reason: 'invalid_artefact_id', artefactId },
    };
  }

  // Convert PascalCase to camelCase: MovieTitle → movieTitle, NarrationScript → narrationScript
  const kindBase = parsed.kind.includes('.')
    ? parsed.kind.slice(parsed.kind.lastIndexOf('.') + 1)
    : parsed.kind;
  const fieldName = toCamelCase(kindBase);
  diagnostics.field = fieldName;
  diagnostics.kind = parsed.kind;

  // Extract field value from JSON
  const fieldValue = response[fieldName];
  if (fieldValue === undefined) {
    return {
      artefactId,
      status: 'failed',
      diagnostics: { ...diagnostics, reason: 'missing_field', field: fieldName },
    };
  }

  // Handle arrays with segment indexing
  let value: unknown;
  if (parsed.index?.segment !== undefined) {
    if (!Array.isArray(fieldValue)) {
      return {
        artefactId,
        status: 'failed',
        diagnostics: {
          ...diagnostics,
          reason: 'expected_array',
          actualType: typeof fieldValue,
        },
      };
    }

    const segmentIndex = parsed.index.segment;
    value = fieldValue[segmentIndex];

    if (value === undefined) {
      return {
        artefactId,
        status: 'failed',
        diagnostics: {
          ...diagnostics,
          reason: 'segment_out_of_bounds',
          segmentIndex,
          arrayLength: fieldValue.length,
        },
      };
    }

    diagnostics.segmentIndex = segmentIndex;
  } else {
    value = fieldValue;
  }

  // Materialize value to string
  const materialized = materializeValue(value);
  if (!materialized.success) {
    return {
      artefactId,
      status: 'failed',
      diagnostics: { ...diagnostics, reason: 'materialization_failed', error: materialized.error },
    };
  }

  return {
    artefactId,
    status: 'succeeded',
    inline: materialized.text,
    diagnostics,
  };
}

/**
 * Parses artifact identifier into kind and index components.
 *
 * @example
 * "Artifact:MovieTitle" → { kind: "MovieTitle", index: undefined }
 * "Artifact:NarrationScript[segment=2]" → { kind: "NarrationScript", index: { segment: 2 } }
 * "Artifact:SegmentImage[segment=1&image=3]" → { kind: "SegmentImage", index: { segment: 1, image: 3 } }
 */
export function parseArtefactIdentifier(identifier: string): ParsedArtefactIdentifier | null {
  if (!identifier.startsWith('Artifact:')) {
    return null;
  }

  const remainder = identifier.slice('Artifact:'.length);
  const [kindPart, ...dimensionParts] = remainder.split('[');
  const kind = kindPart.trim();

  if (!kind) {
    return null;
  }

  const index: Record<string, number> = {};
  for (const part of dimensionParts) {
    const cleaned = part.replace(/\]$/, '');
    const pairs = cleaned.split('&');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        const parsedValue = Number(value.trim());
        if (!Number.isNaN(parsedValue) && Number.isInteger(parsedValue)) {
          index[key.trim()] = parsedValue;
        }
      }
    }
  }

  return {
    kind,
    index: Object.keys(index).length > 0 ? index : undefined,
  };
}

/**
 * Converts PascalCase to camelCase.
 *
 * @example
 * "MovieTitle" → "movieTitle"
 * "NarrationScript" → "narrationScript"
 * "ImagePrompt" → "imagePrompt"
 */
function toCamelCase(str: string): string {
  if (!str || str.length === 0) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Materializes a value to string and optionally buffer format.
 */
function materializeValue(value: unknown): {
  success: boolean;
  text?: string;
  buffer?: Uint8Array | string;
  error?: string;
} {
  if (value == null) {
    return { success: false, error: 'Value is undefined or null.' };
  }

  // String value
  if (typeof value === 'string') {
    return { success: true, text: value, buffer: value };
  }

  // Binary data
  if (value instanceof Uint8Array) {
    return { success: true, text: Buffer.from(value).toString('utf8'), buffer: value };
  }

  // Array - join items with newlines
  if (Array.isArray(value)) {
    const text = value.map((item) => (item == null ? '' : String(item))).join('\n');
    return { success: true, text, buffer: text };
  }

  // Object or other - serialize to JSON
  try {
    const text = JSON.stringify(value, null, 2);
    return { success: true, text, buffer: text };
  } catch {
    return { success: false, error: 'Unable to serialize value to JSON.' };
  }
}
