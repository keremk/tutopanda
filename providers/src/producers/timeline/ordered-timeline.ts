import { Input, ALL_FORMATS, BufferSource as MediaBufferSource } from 'mediabunny';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import { createProviderError } from '../../sdk/errors.js';
import type { HandlerFactory } from '../../types.js';
import type { ResolvedInputsAccessor } from '../../sdk/types.js';

interface FanInValue {
  groupBy: string;
  orderBy?: string;
  groups: string[][];
}

type ClipKind = 'Image' | 'Audio' | 'Music' | 'Video' | 'Captions';

interface TimelineClipConfig {
  kind: ClipKind;
  inputs: string;
  effect?: string;
  duration?: string;
  play?: string;
  fitStrategy?: string;
  partitionBy?: number;
  captionAlgorithm?: string;
  volume?: number;
}

interface TimelineProducerConfig {
  rootFolder?: string;
  source?: string;
  numTracks?: number;
  masterTrack?: {
    kind: ClipKind;
  };
  clips: TimelineClipConfig[];
}

interface TimelineTrack {
  id: string;
  kind: ClipKind;
  clips: TimelineClip[];
}

interface TimelineClip {
  id: string;
  kind: ClipKind;
  startTime: number;
  duration: number;
  properties: Record<string, unknown>;
}

interface TimelineDocument {
  id: string;
  movieId?: string;
  movieTitle?: string;
  duration: number;
  assetFolder?: {
    source?: string;
    rootPath?: string;
  };
  tracks: TimelineTrack[];
}

interface KenBurnsPreset {
  style: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startScale: number;
  endScale: number;
}

const DEFAULT_EFFECT = 'KenBurns';

const KEN_BURNS_PRESETS: KenBurnsPreset[] = [
  {
    style: 'portraitZoomIn',
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    startScale: 1,
    endScale: 1.2,
  },
  {
    style: 'portraitZoomOut',
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    startScale: 1.2,
    endScale: 1,
  },
  {
    style: 'diagonalZoomInDownLeft',
    startX: 40,
    startY: -40,
    endX: -30,
    endY: 30,
    startScale: 1,
    endScale: 1.3,
  },
  {
    style: 'diagonalZoomInUpRight',
    startX: -40,
    startY: 40,
    endX: 30,
    endY: -30,
    startScale: 1,
    endScale: 1.3,
  },
  {
    style: 'landscapePanLeft',
    startX: 60,
    startY: 0,
    endX: -60,
    endY: 0,
    startScale: 1.1,
    endScale: 1.3,
  },
  {
    style: 'landscapePanRight',
    startX: -60,
    startY: 0,
    endX: 60,
    endY: 0,
    startScale: 1.1,
    endScale: 1.3,
  },
];

const TRACK_KINDS_WITH_NATIVE_DURATION = new Set<ClipKind>(['Audio', 'Music', 'Video']);

export function createTimelineProducerHandler(): HandlerFactory {
  return createProducerHandlerFactory({
    domain: 'media',
    configValidator: parseTimelineConfig,
    invoke: async ({ request, runtime }) => {
      const config = runtime.config.parse<TimelineProducerConfig>(parseTimelineConfig);
      if (config.clips.length === 0) {
        throw createProviderError('TimelineProducer config must define at least one clip.', {
          code: 'invalid_config',
          kind: 'user_input',
          causedByUser: true,
        });
      }

      const inputIdMap = buildInputIdMap(request.inputs);
      const resolvedInputs = runtime.inputs.all();
      const assetDurationCache = new Map<string, number>();
      const masterKind = config.masterTrack?.kind ?? config.clips[0]!.kind;
      const fanInByInput = new Map<string, FanInValue>();

      for (const clip of config.clips) {
        const baseName = parseInputReference(clip.inputs);
        if (fanInByInput.has(baseName)) {
          continue;
        }
        const fanIn = readFanInForInput(runtime.inputs, inputIdMap, baseName);
        fanInByInput.set(baseName, fanIn);
      }

      const masterClip = config.clips.find((clip) => clip.kind === masterKind);
      if (!masterClip) {
        throw createProviderError(`Master track kind "${masterKind}" is not defined in the clip configuration.`, {
          code: 'invalid_config',
          kind: 'user_input',
          causedByUser: true,
        });
      }

      const masterFanIn = fanInByInput.get(parseInputReference(masterClip.inputs));
      if (!masterFanIn) {
        throw createProviderError(`Missing fan-in data for master track input "${masterClip.inputs}".`, {
          code: 'missing_fanin',
          kind: 'user_input',
          causedByUser: true,
        });
      }

      const segmentCount = Math.max(masterFanIn.groups.length, 0);
      if (segmentCount === 0) {
        throw createProviderError('TimelineProducer requires at least one segment from the master track.', {
          code: 'missing_segments',
          kind: 'user_input',
          causedByUser: true,
        });
      }

      const masterSegmentDurations = await determineMasterSegmentDurations({
        clip: masterClip,
        fanIn: masterFanIn,
        segmentCount,
        inputs: runtime.inputs,
        durationCache: assetDurationCache,
      });
      const segmentDurations = masterSegmentDurations
        ?? allocateSegmentDurations(readTimelineDuration(resolvedInputs), segmentCount);
      const segmentOffsets = buildSegmentOffsets(segmentDurations);

      const totalTimelineDuration = roundSeconds(segmentDurations.reduce((sum, value) => sum + value, 0));

      const tracks: TimelineTrack[] = await Promise.all(
        config.clips.map(async (clip, index) => {
          const baseName = parseInputReference(clip.inputs);
          const fanIn = fanInByInput.get(baseName);
          if (!fanIn) {
            throw createProviderError(`Missing fan-in data for "${clip.inputs}".`, {
              code: 'missing_fanin',
              kind: 'user_input',
              causedByUser: true,
            });
          }
          return buildTrack({
            clip,
            fanIn,
            trackIndex: index,
            segmentDurations,
            segmentOffsets,
            isMaster: clip === masterClip,
            totalDuration: totalTimelineDuration,
            inputs: runtime.inputs,
            durationCache: assetDurationCache,
          });
        }),
      );

      const timeline: TimelineDocument = {
        id: `timeline-${request.revision}`,
        movieId: readOptionalString(resolvedInputs, ['MovieId', 'movieId']),
        movieTitle: readOptionalString(resolvedInputs, ['MovieTitle', 'ScriptGenerator.MovieTitle']),
        duration: totalTimelineDuration,
        assetFolder: buildAssetFolder(config),
        tracks,
      };

      const artefactId = runtime.artefacts.expectInline(request.produces[0] ?? '');
      return {
        status: 'succeeded',
        artefacts: [
          {
            artefactId,
            status: 'succeeded',
            inline: JSON.stringify(timeline, null, 2),
          },
        ],
      };
    },
  });
}

export const createTimelineStubHandler = createTimelineProducerHandler;

function parseTimelineConfig(raw: unknown): TimelineProducerConfig {
  if (!isRecord(raw)) {
    throw createProviderError('TimelineProducer provider configuration must include a config object.', {
      code: 'invalid_config',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  const source = raw as Record<string, unknown>;
  if (!isRecord(source.config)) {
    throw createProviderError('TimelineProducer provider configuration must include a config object.', {
      code: 'invalid_config',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  const resolved = source.config as Record<string, unknown>;
  const clipsRaw = Array.isArray(resolved.clips) ? resolved.clips : [];
  const clips: TimelineClipConfig[] = clipsRaw
    .map((entry) => (isRecord(entry) ? entry : undefined))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      kind: typeof entry.kind === 'string' ? (entry.kind as ClipKind) : 'Image',
      inputs: typeof entry.inputs === 'string' ? entry.inputs : '',
      effect: typeof entry.effect === 'string' ? entry.effect : undefined,
      duration: typeof entry.duration === 'string' ? entry.duration : undefined,
      play: typeof entry.play === 'string' ? entry.play : undefined,
      fitStrategy: typeof entry.fitStrategy === 'string' ? entry.fitStrategy : undefined,
      partitionBy: typeof entry.partitionBy === 'number' ? entry.partitionBy : undefined,
      captionAlgorithm: typeof entry.captionAlgorithm === 'string' ? entry.captionAlgorithm : undefined,
      volume: typeof entry.volume === 'number' ? entry.volume : undefined,
    }))
    .filter((clip) => clip.inputs.length > 0);

  return {
    rootFolder: typeof resolved.rootFolder === 'string' ? resolved.rootFolder : undefined,
    source: typeof resolved.source === 'string' ? resolved.source : undefined,
    numTracks: typeof resolved.numTracks === 'number' ? resolved.numTracks : undefined,
    masterTrack: isRecord(resolved.masterTrack) && typeof resolved.masterTrack.kind === 'string'
      ? { kind: resolved.masterTrack.kind as ClipKind }
      : undefined,
    clips,
  };
}

function buildAssetFolder(config: TimelineProducerConfig): TimelineDocument['assetFolder'] | undefined {
  if (!config.rootFolder && !config.source) {
    return undefined;
  }
  return {
    source: config.source ?? 'local',
    rootPath: config.rootFolder,
  };
}

async function buildTrack(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  trackIndex: number;
  segmentDurations: number[];
  segmentOffsets: number[];
  isMaster: boolean;
  totalDuration: number;
  inputs: ResolvedInputsAccessor;
  durationCache: Map<string, number>;
}): Promise<TimelineTrack> {
  const { clip, fanIn, trackIndex, segmentDurations, segmentOffsets, isMaster, totalDuration, inputs, durationCache } = args;
  switch (clip.kind) {
    case 'Audio':
      return buildAudioTrack({
        clip,
        fanIn,
        trackIndex,
        segmentDurations,
        segmentOffsets,
        isMaster,
      });
    case 'Image':
      return buildImageTrack({
        clip,
        fanIn,
        trackIndex,
        segmentDurations,
        segmentOffsets,
      });
    case 'Music':
      return buildMusicTrack({
        clip,
        fanIn,
        trackIndex,
        totalDuration,
        inputs,
        durationCache,
      });
    case 'Video':
      return buildVideoTrack({
        clip,
        fanIn,
        trackIndex,
        segmentDurations,
        segmentOffsets,
        inputs,
        durationCache,
      });
    default:
      throw createProviderError(`TimelineProducer does not yet support clip kind "${clip.kind}".`, {
        code: 'unsupported_clip',
        kind: 'user_input',
        causedByUser: true,
      });
  }
}

function buildAudioTrack(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  trackIndex: number;
  segmentDurations: number[];
  segmentOffsets: number[];
  isMaster: boolean;
}): TimelineTrack {
  const { clip, fanIn, trackIndex, segmentDurations, segmentOffsets, isMaster } = args;
  const groups = normalizeGroups(fanIn.groups, segmentDurations.length);
  const clips: TimelineClip[] = [];

  for (let index = 0; index < segmentDurations.length; index += 1) {
    const assets = groups[index] ?? [];
    const assetId = assets[0];
    if (!assetId) {
      if (isMaster) {
        throw createProviderError(`Master track is missing an asset for segment index ${index}.`, {
          code: 'missing_asset',
          kind: 'user_input',
          causedByUser: true,
        });
      }
      continue;
    }

    clips.push({
      id: `clip-${trackIndex}-${index}`,
      kind: clip.kind,
      startTime: segmentOffsets[index],
      duration: segmentDurations[index],
      properties: {
        volume: typeof clip.volume === 'number' ? clip.volume : 1,
        assetId,
      },
    });
  }

  return {
    id: `track-${trackIndex}`,
    kind: clip.kind,
    clips,
  };
}

function buildImageTrack(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  trackIndex: number;
  segmentDurations: number[];
  segmentOffsets: number[];
}): TimelineTrack {
  const { clip, fanIn, trackIndex, segmentDurations, segmentOffsets } = args;
  const effectName = clip.effect ?? DEFAULT_EFFECT;
  const groups = normalizeGroups(fanIn.groups, segmentDurations.length);
  const clips: TimelineClip[] = [];

  for (let index = 0; index < segmentDurations.length; index += 1) {
    const images = groups[index] ?? [];
    const effects = images.map((assetId, imageIndex) => {
      const preset = pickKenBurnsPreset(index, imageIndex);
      return {
        name: effectName,
        style: preset.style,
        assetId,
        startX: preset.startX,
        startY: preset.startY,
        endX: preset.endX,
        endY: preset.endY,
        startScale: preset.startScale,
        endScale: preset.endScale,
      };
    });

    clips.push({
      id: `clip-${trackIndex}-${index}`,
      kind: clip.kind,
      startTime: segmentOffsets[index],
      duration: segmentDurations[index],
      properties: {
        effect: effectName,
        effects,
      },
    });
  }

  return {
    id: `track-${trackIndex}`,
    kind: clip.kind,
    clips,
  };
}

async function buildMusicTrack(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  trackIndex: number;
  totalDuration: number;
  inputs: ResolvedInputsAccessor;
  durationCache: Map<string, number>;
}): Promise<TimelineTrack> {
  const { clip, fanIn, trackIndex, totalDuration, inputs, durationCache } = args;
  const assets = flattenFanInAssets(fanIn);
  if (assets.length === 0) {
    throw createProviderError('TimelineProducer requires at least one asset for music tracks.', {
      code: 'missing_asset',
      kind: 'user_input',
      causedByUser: true,
    });
  }

  const durationMode = clip.duration === 'match' ? 'match' : 'full';
  const playMode = clip.play === 'no-loop' ? 'no-loop' : 'loop';
  const volume = typeof clip.volume === 'number' ? clip.volume : 1;
  const clips: TimelineClip[] = [];
  let cursor = 0;

  const playAsset = (assetId: string, clipDuration: number): void => {
    if (clipDuration <= 0) {
      return;
    }
    clips.push({
      id: `clip-${trackIndex}-${clips.length}`,
      kind: clip.kind,
      startTime: roundSeconds(cursor),
      duration: clipDuration,
      properties: {
        volume,
        assetId,
      },
    });
    cursor = roundSeconds(cursor + clipDuration);
  };

  if (durationMode === 'match') {
    for (const assetId of assets) {
      if (cursor >= totalDuration) {
        break;
      }
      const assetDuration = await loadAssetDuration({ assetId, inputs, cache: durationCache });
      const remaining = totalDuration - cursor;
      playAsset(assetId, Math.min(assetDuration, remaining));
    }
  } else if (playMode === 'no-loop') {
    for (const assetId of assets) {
      if (cursor >= totalDuration) {
        break;
      }
      const assetDuration = await loadAssetDuration({ assetId, inputs, cache: durationCache });
      const remaining = totalDuration - cursor;
      playAsset(assetId, Math.min(assetDuration, remaining));
    }
  } else {
    let loopIndex = 0;
    while (cursor < totalDuration && assets.length > 0) {
      const assetId = assets[loopIndex % assets.length]!;
      const assetDuration = await loadAssetDuration({ assetId, inputs, cache: durationCache });
      const remaining = totalDuration - cursor;
      playAsset(assetId, Math.min(assetDuration, remaining));
      loopIndex += 1;
    }
  }

  if (clips.length === 0) {
    throw createProviderError('TimelineProducer could not schedule any music clips.', {
      code: 'missing_asset',
      kind: 'user_input',
      causedByUser: true,
    });
  }

  return {
    id: `track-${trackIndex}`,
    kind: clip.kind,
    clips,
  };
}

async function buildVideoTrack(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  trackIndex: number;
  segmentDurations: number[];
  segmentOffsets: number[];
  inputs: ResolvedInputsAccessor;
  durationCache: Map<string, number>;
}): Promise<TimelineTrack> {
  const { clip, fanIn, trackIndex, segmentDurations, segmentOffsets, inputs, durationCache } = args;
  const groups = normalizeGroups(fanIn.groups, segmentDurations.length);
  const clips: TimelineClip[] = [];

  for (let index = 0; index < segmentDurations.length; index += 1) {
    const assets = groups[index] ?? [];
    const assetId = assets[0];
    if (!assetId) {
      continue;
    }
    const originalDuration = await loadAssetDuration({ assetId, inputs, cache: durationCache });
    const fitStrategy = resolveVideoFitStrategy(clip.fitStrategy, segmentDurations[index], originalDuration);
    const properties: Record<string, unknown> = {
      assetId,
      originalDuration,
      fitStrategy,
    };
    if (typeof clip.volume === 'number') {
      properties.volume = clip.volume;
    }

    clips.push({
      id: `clip-${trackIndex}-${index}`,
      kind: clip.kind,
      startTime: segmentOffsets[index],
      duration: segmentDurations[index],
      properties,
    });
  }

  return {
    id: `track-${trackIndex}`,
    kind: clip.kind,
    clips,
  };
}

function pickKenBurnsPreset(segmentIndex: number, imageIndex: number): KenBurnsPreset {
  const presetIndex = (segmentIndex + imageIndex) % KEN_BURNS_PRESETS.length;
  return KEN_BURNS_PRESETS[presetIndex]!;
}

function buildInputIdMap(inputs: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const input of inputs) {
    if (!input.startsWith('Input:')) {
      continue;
    }
    const canonical = input;
    const trimmed = canonical.slice('Input:'.length);
    const base = stripNamespace(trimmed);
    map.set(canonical, canonical);
    map.set(trimmed, canonical);
    map.set(base, canonical);
  }
  return map;
}

function readFanInForInput(
  inputs: ResolvedInputsAccessor,
  inputIdMap: Map<string, string>,
  baseName: string,
): FanInValue {
  const canonicalId = inputIdMap.get(baseName);
  if (!canonicalId) {
    throw createProviderError(`TimelineProducer could not resolve input "${baseName}".`, {
      code: 'unknown_input',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  const fanIn = resolveFanIn(inputs, canonicalId);
  if (!fanIn) {
    throw createProviderError(`TimelineProducer is missing fan-in data for "${baseName}".`, {
      code: 'missing_fanin',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  return fanIn;
}

function resolveFanIn(inputs: ResolvedInputsAccessor, canonicalId: string): FanInValue | undefined {
  const direct = inputs.getByNodeId<FanInValue>(canonicalId);
  if (isFanInValue(direct)) {
    return normalizeFanIn(direct);
  }
  const trimmed = canonicalId.replace(/^Input:/, '');
  const scoped = inputs.get<FanInValue>(trimmed);
  if (isFanInValue(scoped)) {
    return normalizeFanIn(scoped);
  }
  const base = stripNamespace(trimmed);
  const baseValue = inputs.get<FanInValue>(base);
  if (isFanInValue(baseValue)) {
    return normalizeFanIn(baseValue);
  }
  return undefined;
}

function normalizeFanIn(value: FanInValue): FanInValue {
  const groups = Array.isArray(value.groups) ? value.groups : [];
  return {
    groupBy: value.groupBy,
    orderBy: value.orderBy,
    groups: groups.map((group) => (Array.isArray(group) ? [...group] : [])),
  };
}

function readTimelineDuration(inputs: Record<string, unknown>): number {
  const candidates = [
    'Input:TimelineComposer.Duration',
    'TimelineComposer.Duration',
    'Input:Duration',
    'Duration',
  ];
  for (const key of candidates) {
    const value = inputs[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  throw createProviderError('TimelineProducer requires a positive Duration input.', {
    code: 'missing_duration',
    kind: 'user_input',
    causedByUser: true,
  });
}

function allocateSegmentDurations(total: number, count: number): number[] {
  const base = total / count;
  const durations = Array.from({ length: count }, () => roundSeconds(base));
  const sum = durations.reduce((acc, value) => acc + value, 0);
  const delta = roundSeconds(total - sum);
  durations[count - 1] = roundSeconds(durations[count - 1] + delta);
  return durations;
}

async function determineMasterSegmentDurations(args: {
  clip: TimelineClipConfig;
  fanIn: FanInValue;
  segmentCount: number;
  inputs: ResolvedInputsAccessor;
  durationCache: Map<string, number>;
}): Promise<number[] | undefined> {
  if (!TRACK_KINDS_WITH_NATIVE_DURATION.has(args.clip.kind)) {
    return undefined;
  }
  return readSegmentDurationsFromAssets({
    fanIn: args.fanIn,
    segmentCount: args.segmentCount,
    inputs: args.inputs,
    durationCache: args.durationCache,
  });
}

async function readSegmentDurationsFromAssets(args: {
  fanIn: FanInValue;
  segmentCount: number;
  inputs: ResolvedInputsAccessor;
  durationCache: Map<string, number>;
}): Promise<number[]> {
  const groups = normalizeGroups(args.fanIn.groups, args.segmentCount);
  const durations: number[] = [];

  for (let index = 0; index < args.segmentCount; index += 1) {
    const assetId = groups[index]?.[0];
    if (!assetId) {
      throw createProviderError(`Master track is missing an asset for segment index ${index}.`, {
        code: 'missing_asset',
        kind: 'user_input',
        causedByUser: true,
      });
    }
    const duration = await loadAssetDuration({
      assetId,
      inputs: args.inputs,
      cache: args.durationCache,
    });
    durations.push(duration);
  }

  return durations;
}

async function loadAssetDuration(args: {
  assetId: string;
  inputs: ResolvedInputsAccessor;
  cache: Map<string, number>;
}): Promise<number> {
  const cached = args.cache.get(args.assetId);
  if (cached !== undefined) {
    return cached;
  }

  const payload = resolveAssetBinary(args.inputs, args.assetId);
  let input: Input<MediaBufferSource> | undefined;

  try {
    const source = new MediaBufferSource(payload);
    input = new Input({
      formats: ALL_FORMATS,
      source,
    });
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Asset reported a non-positive duration.');
    }
    const rounded = roundSeconds(duration);
    args.cache.set(args.assetId, rounded);
    return rounded;
  } catch (error) {
    throw createProviderError(`TimelineProducer failed to read duration for asset "${args.assetId}".`, {
      code: 'asset_duration_failed',
      kind: 'unknown',
      causedByUser: false,
      metadata: { assetId: args.assetId },
      raw: error,
    });
  } finally {
    input?.dispose();
  }
}

function resolveAssetBinary(inputs: ResolvedInputsAccessor, assetId: string): ArrayBuffer | ArrayBufferView {
  const value = inputs.getByNodeId(assetId);
  if (isBinaryPayload(value)) {
    return value;
  }
  if (value !== undefined) {
    throw createProviderError(`TimelineProducer expected binary data for asset "${assetId}".`, {
      code: 'invalid_asset_payload',
      kind: 'unknown',
      causedByUser: false,
      metadata: { assetId, valueType: typeof value },
    });
  }

  throw createProviderError(`TimelineProducer could not locate binary data for asset "${assetId}".`, {
    code: 'missing_asset_payload',
    kind: 'unknown',
    causedByUser: false,
    metadata: { assetId },
  });
}

function isBinaryPayload(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function buildSegmentOffsets(durations: number[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const duration of durations) {
    offsets.push(roundSeconds(cursor));
    cursor += duration;
  }
  return offsets;
}

function normalizeGroups(groups: string[][], length: number): string[][] {
  return Array.from({ length }, (_, index) => {
    const group = groups[index];
    if (!Array.isArray(group)) {
      return [];
    }
    return group.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  });
}

function flattenFanInAssets(fanIn: FanInValue): string[] {
  const flattened: string[] = [];
  for (const group of fanIn.groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const assetId of group) {
      if (typeof assetId === 'string' && assetId.length > 0) {
        flattened.push(assetId);
      }
    }
  }
  return flattened;
}

function parseInputReference(reference: string): string {
  const bracketIndex = reference.indexOf('[');
  const base = bracketIndex >= 0 ? reference.slice(0, bracketIndex) : reference;
  return base.trim();
}

function resolveVideoFitStrategy(fitStrategy: string | undefined, segmentDuration: number, originalDuration: number): string {
  if (typeof fitStrategy === 'string' && fitStrategy !== 'auto') {
    return fitStrategy;
  }
  if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
    return fitStrategy ?? 'stretch';
  }
  const ratio = Math.abs(segmentDuration - originalDuration) / originalDuration;
  return ratio <= 0.2 ? 'stretch' : 'freeze-fade';
}

function stripNamespace(name: string): string {
  const separatorIndex = name.lastIndexOf('.');
  return separatorIndex >= 0 ? name.slice(separatorIndex + 1) : name;
}

function readOptionalString(inputs: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = inputs[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isFanInValue(value: unknown): value is FanInValue {
  if (!isRecord(value)) {
    return false;
  }
  return Array.isArray(value.groups);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
