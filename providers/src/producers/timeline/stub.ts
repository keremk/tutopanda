import type { HandlerFactory, ProducerHandler, ProviderJobContext, ProviderResult } from '../../types.js';

interface FanInValue {
  groupBy: string;
  orderBy?: string;
  groups: string[][];
}

function readFanInValue(context: ProviderJobContext, canonicalId: string): FanInValue | undefined {
  const extras = context.context.extras;
  if (!extras || typeof extras !== 'object') {
    return undefined;
  }
  const resolved = (extras as Record<string, unknown>).resolvedInputs;
  if (!resolved || typeof resolved !== 'object') {
    return undefined;
  }
  const resolvedInputs = resolved as Record<string, unknown>;
  const value = resolvedInputs[canonicalId] ?? resolvedInputs[trimCanonical(canonicalId)];
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const fanIn = value as FanInValue;
  if (!Array.isArray(fanIn.groups)) {
    return undefined;
  }
  return fanIn;
}

function trimCanonical(id: string): string {
  return id.replace(/^(Artifact|Input):/, '');
}

function formatFanInText(label: string, fanIn: FanInValue): string {
  const segments = fanIn.groups
    .map((group, index) => {
      if (!group || group.length === 0) {
        return `- ${label} ${index}: (none)`;
      }
      return `- ${label} ${index}: ${group.join(', ')}`;
    })
    .join('\n');
  return segments || `- ${label}: (none)`;
}

export function createTimelineStubHandler(): HandlerFactory {
  return ({ descriptor, mode }) => {
    const handler: ProducerHandler = {
      provider: descriptor.provider,
      model: descriptor.model,
      environment: descriptor.environment,
      mode,
      async invoke(request: ProviderJobContext): Promise<ProviderResult> {
        const imageFanIn = readFanInValue(request, 'Input:TimelineComposer.ImageSegments');
        const audioFanIn = readFanInValue(request, 'Input:TimelineComposer.AudioSegments');
        if (!imageFanIn || !audioFanIn) {
          throw new Error('TimelineProducer stub requires ImageSegments and AudioSegments fan-in inputs.');
        }
        const content = [
          'Timeline Stub Summary',
          '',
          'Images:',
          formatFanInText('segment', imageFanIn),
          '',
          'Audio:',
          formatFanInText('segment', audioFanIn),
          '',
          'All inputs accepted successfully.',
        ].join('\n');
        const artefactId = request.produces[0];
        return {
          status: 'succeeded',
          artefacts: [
            {
              artefactId,
              status: 'succeeded',
              inline: content,
            },
          ],
        };
      },
    };
    return handler;
  };
}
