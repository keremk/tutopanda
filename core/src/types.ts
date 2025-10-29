type Id = string;
type IsoDatetime = string;

export type CardinalityTag = "single" | "perSegment" | "perSegmentImage";

export type CardinalityDimension = "segment" | "image";

export const cardinalityToDimensions: Record<CardinalityTag, CardinalityDimension[]> = {
  single: [],
  perSegment: ["segment"],
  perSegmentImage: ["segment", "image"],
};

export type ConditionKey = "useVideo" | "isImageToVideo";

export interface Condition {
  key: ConditionKey;
  equals: boolean;
}

// --- node kinds ---
export type NodeKind = "InputSource" | "Producer" | "Artifact";

// --- artifacts ---
export type ArtifactKind =
  | "MovieTitle" | "MovieSummary" | "NarrationScript"
  | "MusicPrompt" | "MusicTrack"
  | "SegmentAudio"
  | "ImagePrompt" | "SegmentImage"
  | "StartImagePrompt" | "StartImage"
  | "TextToVideoPrompt" | "ImageToVideoPrompt"
  | "SegmentVideo"
  | "FinalVideo";

export interface Artifact {
  id: Id;
  kind: ArtifactKind;
  version: number;
  createdAt: IsoDatetime;
  producedBy: Id;          // Producer.id
  payloadRef: string;      // blob/key/URL; never inline raw bytes
  meta?: Record<string, unknown>;
}

// --- inputs (CUI) ---
export type InputSourceKind =
  | "InquiryPrompt" | "Duration" | "Audience" | "Language"
  | "MusicPromptInput" | "SegmentNarrationInput"
  | "VoiceId" | "Emotion"
  | "UseVideo" | "ImagesPerSegment"
  | "SegmentImagePromptInput" | "ImageStyle"
  | "Size" | "AspectRatio" | "IsImageToVideo"
  | "StartingImagePromptInput" | "MovieDirectionPromptInput"
  | "AssemblyStrategy" | "SegmentAnimations";

export interface InputSource<T = unknown> {
  id: Id;
  kind: InputSourceKind;
  value: T;
  editable: boolean;      // true for user-editable CUIs
  updatedAt: IsoDatetime;
}

// --- producers (GEN) ---
export type ProducerKind =
  | "ScriptProducer"
  | "TextToMusicPromptProducer" | "MusicProducer"
  | "AudioProducer"
  | "TextToImagePromptProducer" | "TextToImageProducer"
  | "TextToVideoPromptProducer" | "TextToVideoProducer"
  | "ImageToVideoPromptProducer" | "StartImageProducer" | "ImageToVideoProducer"
  | "TimelineAssembler";

export type ProviderName = "openai" | "replicate" | "elevenlabs" | "fal" | "custom" | "internal";

export interface Producer {
  id: Id;
  kind: ProducerKind;
  provider: ProviderName;
  providerModel: string;
  // Input dependencies by id (InputSource or Artifact)
  inputs: Id[];
  // Declared outputs’ kinds (for planning)
  produces: ArtifactKind[];
  // Execution characteristics
  rateKey: string;          // key for rate-limiting bucket
  costClass?: "low" | "mid" | "high";
  medianLatencySec?: number;
}

type NodeId<K extends NodeKind> =
  K extends "InputSource" ? InputSourceKind :
  K extends "Producer" ? ProducerKind :
  ArtifactKind;

export type BlueprintNodeRef<K extends NodeKind = NodeKind> = {
  kind: K;
  id: NodeId<K>;
};

export interface BlueprintNode<K extends NodeKind = NodeKind> {
  ref: BlueprintNodeRef<K>;
  cardinality: CardinalityTag;
  label?: string;
  description?: string;
  when?: Condition[][];
}

export interface BlueprintEdge {
  from: BlueprintNodeRef;
  to: BlueprintNodeRef;
  dimensions?: CardinalityDimension[];
  when?: Condition[];
  note?: string;
}

export interface BlueprintSection {
  id: string;
  label: string;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export interface GraphBlueprint {
  sections: BlueprintSection[];
}

// --- build / planning ---
export type RevisionId = `rev-${string}`;

export interface JobDescriptor {
  jobId: Id;
  producer: ProducerKind | string;
  inputs: Id[];
  context?: Record<string, unknown>;
}

export interface ExecutionPlan {
  revision: RevisionId;
  manifestBaseHash: string;
  layers: JobDescriptor[][];
  createdAt: IsoDatetime;
}

export interface BlobRef {
  hash: string;
  size: number;
  mimeType: string;
}

export interface ManifestInputEntry {
  hash: string;
  payloadDigest: string;
  createdAt: IsoDatetime;
}

export interface ManifestArtefactEntry {
  hash: string;
  blob?: BlobRef;
  inline?: string;
  producedBy: Id;
  status: ArtefactEventStatus;
  createdAt: IsoDatetime;
}

export interface Manifest {
  revision: RevisionId;
  baseRevision: RevisionId | null;
  createdAt: IsoDatetime;
  inputs: Record<string, ManifestInputEntry>;
  artefacts: Record<string, ManifestArtefactEntry>;
  timeline?: TimelineDocument;
}

export type TimelineDocument = Record<string, unknown>;

export interface ManifestPointer {
  revision: RevisionId | null;
  manifestPath: string | null;
  hash: string | null;
  updatedAt: IsoDatetime | null;
}

export interface Clock {
  now(): IsoDatetime;
}

export type InputEventSource = 'user' | 'system';

export interface InputEvent {
  id: Id;
  revision: RevisionId;
  hash: string;
  payload: unknown;
  editedBy: InputEventSource;
  createdAt: IsoDatetime;
}

export type ArtefactEventStatus = 'succeeded' | 'failed' | 'skipped';

export interface ArtefactEventOutput {
  blob?: BlobRef;
  inline?: string;
}

export interface ArtefactEvent {
  artefactId: Id;
  revision: RevisionId;
  inputsHash: string;
  output: ArtefactEventOutput;
  status: ArtefactEventStatus;
  producedBy: Id;
  diagnostics?: Record<string, unknown>;
  createdAt: IsoDatetime;
}
