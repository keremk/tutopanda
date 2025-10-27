Awesome—here’s a tight, production-ready naming scheme for your TS codebase that aligns with **InputSource → Producer → Artifact** and your DAG + runner model.

# Core graph types

```ts
// --- identities ---
type Id = string;
type IsoDatetime = string;

// --- node kinds ---
export type NodeKind = "InputSource" | "Producer" | "Artifact";

// --- artifacts ---
export type ArtifactKind =
  | "VideoTitle" | "VideoSummary" | "NarrationScript"
  | "MusicPrompt" | "MusicTrack"
  | "NarrationAudio"
  | "ImagePrompt" | "Image"
  | "StartImagePrompt" | "StartImage"
  | "TextVideoPrompt" | "ImageVideoPrompt"
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
  | "InquiryPrompt" | "Duration" | "Audience"
  | "MusicPromptMod" | "NarrationSegmentScriptMod"
  | "VoiceId" | "Emotion"
  | "UseVideo" | "ImagesPerSegment"
  | "SegmentImagePromptMod" | "ImageStyle"
  | "Size" | "AspectRatio" | "IsImageToVideo"
  | "StartingImagePromptMod" | "MovieDirectionPromptMod"
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
  | "TextToImagePromptProducer" | "ImageProducer"
  | "TextToVideoPromptProducer" | "TextVideoProducer"
  | "ImageToVideoPromptProducer" | "StartImageProducer" | "ImageVideoProducer";

export type ProviderName = "openai" | "replicate" | "elevenlabs" | "runway" | "custom";

export interface Producer {
  id: Id;
  kind: ProducerKind;
  provider: ProviderName;
  // Input dependencies by id (InputSource or Artifact)
  inputs: Id[];
  // Declared outputs’ kinds (for planning)
  produces: ArtifactKind[];
  // Execution characteristics
  rateKey: string;          // key for rate-limiting bucket
  costClass?: "low" | "mid" | "high";
  medianLatencySec?: number;
}
```

# Graph + dependencies

```ts
export interface Graph {
  inputs: Record<Id, InputSource>;
  producers: Record<Id, Producer>;
  artifacts: Record<Id, Artifact>;
}

export interface Edge {
  from: Id;                 // InputSource | Artifact
  to: Id;                   // Producer
}

export interface DependencyIndex {
  incoming: Record<Id, Id[]>; // nodeId -> [deps]
  outgoing: Record<Id, Id[]>; // nodeId -> [dependents]
}
```

# Dirty/failed state & regeneration

```ts
export type DirtyReason = "UserEdit" | "UpstreamChanged" | "Failure" | "Expired";

export interface NodeState {
  dirty: boolean;
  dirtyReason?: DirtyReason;
  failed?: boolean;
  failureCode?: string;       // 4xx/5xx-ish, provider code, etc.
  lastRunAt?: IsoDatetime;
}

export type NodeStates = Record<Id, NodeState>;
```

# Planning & execution

```ts
// A single executable unit (one Producer run generating one or more artifacts)
export interface Job {
  id: Id;
  producerId: Id;
  inputIds: Id[];                  // resolved concrete inputs
  expectedArtifacts: ArtifactKind[];
  cardinalityHint?: number;        // e.g., n or n*m for batching UI
}

export interface JobBatch {        // parallelizable set with no unmet deps
  id: Id;
  jobs: Job[];
}

export interface ExecutionPlan {   // FIFO of batches by topological depth
  batches: JobBatch[];
}

// Rate-limit aware grouping within a batch
export interface ProviderGroup {
  provider: ProviderName;
  rateKey: string;
  jobs: Job[];
}

export interface RunResult {
  jobId: Id;
  ok: boolean;
  produced?: Artifact[];           // saved elsewhere; ids are fine
  error?: { code: string; message: string };
}
```

# Planner / runner APIs

```ts
export interface PlanOptions {
  states: NodeStates;
  prune: { useVideo: boolean; isImageToVideo: boolean };
}

export function buildDependencyIndex(g: Graph): DependencyIndex {}
export function computeDirtySet(g: Graph, states: NodeStates): Set<Id> {}
export function buildExecutionPlan(g: Graph, opts: PlanOptions): ExecutionPlan {}

export interface RunOptions {
  maxConcurrency: number;
  perRateKeyLimit: number; // e.g., 5 calls per provider bucket
}

export function groupByProvider(batch: JobBatch): ProviderGroup[] {}
export async function runPlan(plan: ExecutionPlan, opts: RunOptions): Promise<RunResult[]> {}
```

# Naming conventions & patterns

* **Types & interfaces:** `PascalCase` (`Artifact`, `Producer`, `ExecutionPlan`).
* **Instances/variables:** `camelCase` (`artifactId`, `producerId`, `jobBatch`).
* **Booleans:** `is*` / `has*` (`isImageToVideo`, `hasFailures`).
* **Enums-as-unions:** string literal unions for portability and DX.
* **Provider keys:** `provider: "openai"`, `rateKey: "openai.chat.completions"`.
* **Files/folders:**

  * `graph/` → `types.ts`, `graph.ts` (build/toposort/prune)
  * `plan/` → `planner.ts`, `cardinality.ts`
  * `run/` → `runner.ts`, `rateLimit.ts`, `providers/`
  * `state/` → `nodeState.ts`, `persistence.ts`

# Example flow (reads cleanly)

```ts
// mark edits
states[inputs.useVideo.id] = { dirty: true, dirtyReason: "UserEdit" };

// plan
const plan = buildExecutionPlan(graph, { states, prune: { useVideo: true, isImageToVideo: false } });

// execute
await runPlan(plan, { maxConcurrency: 12, perRateKeyLimit: 5 });
```

If you want, I can drop in minimal implementations for `buildExecutionPlan` (BFS over `Producer` nodes, dedupe via `rateKey`, merge multi-dependency producers) and a stubbed `runner` with provider adapters.
