import { Buffer } from 'node:buffer';
import type { ArtifactKind, ProducedArtefact } from 'tutopanda-core';
import type { ProviderJobContext } from './types.js';

const blobKinds = new Set<ArtifactKind>([
  'SegmentAudio',
  'MusicTrack',
  'SegmentImage',
  'StartImage',
  'SegmentVideo',
  'FinalVideo',
]);

const mimeTypes: Partial<Record<ArtifactKind, string>> = {
  SegmentAudio: 'audio/wav',
  MusicTrack: 'audio/mpeg',
  SegmentImage: 'image/png',
  StartImage: 'image/png',
  SegmentVideo: 'video/mp4',
  FinalVideo: 'video/mp4',
};

export function createMockArtefacts(request: ProviderJobContext): ProducedArtefact[] {
  return request.produces.map((artefactId, index) => {
    const kind = parseArtifactKind(artefactId);
    const diagnostics = {
      provider: request.provider,
      attempt: request.attempt,
      index,
    };

    const metadata = serializeMetadata({
      provider: request.provider,
      model: request.model,
      environment: request.context.environment ?? 'local',
      jobId: request.jobId,
      produces: artefactId,
      inputs: request.inputs,
      providerConfig: request.context.providerConfig,
      attachments: request.context.rawAttachments,
      extras: request.context.extras,
    });

    const mimeType = kind && blobKinds.has(kind)
      ? mimeTypes[kind] ?? 'application/octet-stream'
      : 'text/plain';

    return {
      artefactId,
      status: 'succeeded',
      blob: { data: Buffer.from(metadata, 'utf8'), mimeType },
      diagnostics,
    };
  });
}

function serializeMetadata(meta: {
  provider: string;
  model: string;
  environment: string;
  jobId: string;
  produces: string;
  inputs: string[];
  providerConfig?: unknown;
  attachments?: ProviderJobContext['context']['rawAttachments'];
  extras?: Record<string, unknown> | undefined;
}): string {
  const attachmentSummaries = (meta.attachments ?? []).map((attachment) => ({
    name: attachment.name,
    format: attachment.format,
    preview: attachment.contents.slice(0, 200),
  }));

  const payload = {
    description: 'Mock provider execution output',
    provider: meta.provider,
    model: meta.model,
    environment: meta.environment,
    jobId: meta.jobId,
    produces: meta.produces,
    inputs: meta.inputs,
    providerConfig: meta.providerConfig,
    attachments: attachmentSummaries,
    extras: meta.extras,
    note: 'This artefact was generated in mock mode. No external API was called.',
  } satisfies Record<string, unknown>;

  return JSON.stringify(payload, null, 2);
}

function parseArtifactKind(artefactId: string): ArtifactKind | undefined {
  const match = /^Artifact:([^[]+)/.exec(artefactId);
  if (!match) {
    return undefined;
  }
  return match[1] as ArtifactKind;
}
