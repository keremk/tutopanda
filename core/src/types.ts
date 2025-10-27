type Id = string;
type IsoDatetime = string;

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
  | "SegmentVideo";

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
  | "AssemblyStrategy";

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
  | "ImageToVideoPromptProducer" | "StartImageProducer" | "ImageToVideoProducer";

export type ProviderName = "openai" | "replicate" | "elevenlabs" | "fal" | "custom";

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