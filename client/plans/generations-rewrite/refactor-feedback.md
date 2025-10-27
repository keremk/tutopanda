# Refactor Feedback

## Detailed Algorithms

### Planning (Job Graph Construction)
1. **Normalize Inputs**
   - Ingest all CUI records (InquiryPrompt, UseVideo, Segment overrides, etc.) plus the persisted state of every TAG.
   - Expand the “annotated” diagram into a concrete DAG instance by materializing cardinalities: e.g. for `n = duration/10` and `m = imagesPerSegment`, instantiate `NarrationSegmentScript[i] (0 ≤ i < n)` and `SegmentImagePrompt[i][j] (0 ≤ j < m)`.
2. **Build Node Registry**
   - For each GEN, store `id`, `type`, `provider`, `cost_estimate`, `dependencies` (list of node ids), and `produces` (list of TAG ids). Also register reverse edges TAG ➜ consumer GENs to speed up dirty propagation later.
   - Maintain status metadata for every TAG: `{version, checksum, producedBy, dirtyReason?, failedAt?, lastJobId?}`.
3. **Dirty Marking**
   - On a full run, mark every TAG as dirty.
   - On regeneration, mark TAGs dirty if (a) user edited their upstream CUIs, (b) they previously failed, or (c) one of their upstream TAGs is dirty. Propagate dirtiness by walking the reverse edges so that any downstream GEN with at least one dirty dependency is flagged as needing work.
4. **Layered Topological Walk**
   - Use a Kahn-style traversal to produce execution “layers”. Initialize a queue with every GEN whose dependencies are satisfied (all dependencies exist, and any dirty dependencies have been scheduled earlier in the same layer batch).
   - Pop a GEN, attach it to the current layer (array). As soon as the layer contains a GEN that depends on TAGs being produced later in the same BFS depth, flush the current layer into the FIFO queue and start a fresh layer. This prevents accidentally running a GEN before its newest dependencies exist.
   - When a GEN produces multiple TAGs (e.g. `ScriptGen` → `VideoSummary`, `VideoTitle`, `NarrationSegmentScript[i]`), atomically register all outputs as pending so that downstream GENs can already appear in later layers even though they will execute after the parent finishes.
5. **Dependency Coalescing**
   - If multiple upstream branches point to the same GEN (example: `VideoSummary` and `VideoTitle` both feeding `TextToMusicPromptGen`), deduplicate by storing them under a single job entry whose dependency list is the union of all required TAGs plus any CUIs such as `MusicPromptMod`.
6. **Output**
   - The planner emits an ordered queue of layers. Each layer is an array of job specs:
     ```
     {
       jobId,
       genId,
       provider,
       dependencies: [TAG ids],
       produces: [TAG ids],
       metadata: {cardinalityIndex, prompts, modelConfig}
     }
     ```
   - Persist the queue (or a hash) so the runner can resume if a Workflow execution crashes mid-flight.

**Example (UseVideo=false, n=3, m=2)**
1. Layer 0: `ScriptGen`.
2. Layer 1: `TextToMusicPromptGen`, `AudioGen[0..2]`, `TextToImagePromptGen[0..2]`.
3. Layer 2: `MusicGen`, `ImageGen[0..2][0..1]`.
4. Layer 3: `TimelineAssembler`.

### Execution (Workflow Runner)
1. **Stage Initialization**
   - For each layer, inspect the provider mix and chunk the jobs by `provider` respecting configured concurrency (e.g. OpenAI max 5, Replicate max 2). Produce sub-batches `batch = {provider, jobs[]}`.
   - Create a Workflow run context storing retries, jitter strategy, cost counters, and telemetry IDs.
2. **Batch Dispatch**
   - Issue each batch via `Promise.all` inside the Workflow step that corresponds to that provider. Between batches, await completion so per-provider rate limits are honored while still allowing cross-provider parallelism.
   - Every job call returns `{status, outputAssetId?, failureReason?}` which is durably written before moving on.
3. **Error Propagation**
   - Hard failures mark both the job and each produced TAG as `failed` with metadata (`retryable?`, `providerErrorCode`, `dependencyChain`). Downstream GENs remain skipped this run because their dependencies never became “ready”.
   - Soft failures (e.g. validation issues) should set `dirtyReason = 'validation'` so UI can surface actionable prompts.
4. **Checkpointing**
   - After each layer, persist: completed job IDs, TAG versions (hash of payload or asset ID), and pointer to the next layer. This allows rerunning from the latest stable boundary if the Workflow is interrupted.
5. **Completion**
   - When all layers succeed, invoke `TimelineAssembler` with `{segments, musicAssetId, audioAssetIds[], images[], videos[]}` plus the selected `AssemblyStrategy`. Emit the final Remotion descriptor and mark the entire DAG snapshot version as complete.

**Execution Example**
- Suppose `ImageGen[1][0]` fails on Replicate with a 5xx. The runner records it as `retryable=true`, `failedAt=ImageGen`. Layer 2 terminates early for that job, but other images and the music job succeed. When the user clicks “regenerate segment 2 visuals”, only the dirty TAGs (`SegmentImageAsset[1][*]` and anything downstream, such as a dependent `ImageToVideoGen` if videos were enabled) are placed back into new layers.

## Identified Gaps & Open Questions
1. **State Store / Versioning**
   - The proposal assumes we know whether a TAG is dirty or failed, but it does not define where this metadata lives (database schema, cache, object store). We need a persistent DAG state table storing per-node versions, hashes, timestamps, and dependency pointers to support regeneration and conflict detection.
2. **Deterministic Input Hashing**
   - “Dirty” determination references user edits but does not explain how to hash structured prompts, model configs, or provider settings. Without canonical hashing, identical regenerations might still run, wasting cost.
3. **Provider Rate-Limit Contracts**
   - Batching logic cites generic `maxConcurrency`, yet we have no plan for dynamic backoff, multi-tenant quotas, or cost ceilings per workspace. For OpenAI-style token quotas we probably need a leaky-bucket controller rather than static integers.
4. **Workflow Failure Recovery**
   - The runner sketch stops after marking failures but does not describe how a crashed Workflow resumes. We need explicit idempotency keys per job, plus a process for rehydrating in-flight batches if Vercel Workflow retries the entire step.
5. **Data Locality / Storage Costs**
   - Assets (audio/video/image) can be large; the plan does not specify when to upload, where to store (S3, Vercel Blob, etc.), or how to clean up orphaned artifacts when regenerations replace assets.
6. **Timeline Assembly Inputs**
   - Assembly consumes all finished assets, yet there is no schema for how segments are described (timing, transitions, keyframes). We should define a normalized DTO; otherwise assembler changes may create hidden coupling with generation.
7. **Testing Strategy**
   - The document highlights the lack of tests but offers no plan (mocks, fixture DAGs, dry-run mode). We need at least: (a) unit tests for planner layering, (b) simulation harness for rate-limit enforcement, and (c) contract tests per provider adapter.
8. **Observability**
   - No mention of structured logs, metrics, or tracing. Given multi-minute jobs, we should include per-job spans, cost counters, and UI-friendly progress events (e.g. WebSocket or polling API).

## Architectural Critique
1. **Manual BFS Layer Management**
   - The current write-up relies on ad-hoc “arrays of jobs” plus logic to move a GEN between arrays when new dependencies appear. This recreates well-known topological-sort behavior but adds edge cases (e.g. removal from prior queue). Adopting a standard DAG scheduler (Kahn or DFS with indegree tracking) would reduce complexity and make correctness proofs easier.
2. **Multi-Output GEN Handling**
   - Treating CUIs as annotations is smart, but GENs that emit heterogeneous outputs (ScriptGen produces three TAG types) are still modeled as a single job. Without an explicit schema for composite outputs, downstream consumers must remember which field to read, increasing coupling. Consider emitting a typed bundle object or splitting ScriptGen into distinct logical nodes to keep dependencies explicit.
3. **Single Timeline Assembler Pass**
   - The architecture reserves assembly for the final step. That means we cannot preview partially generated segments or stream updates to the editor until everything finishes. If faster user feedback matters, we may want an incremental assembler that can stitch per-segment timelines as soon as their assets exist.
4. **All-or-Nothing Workflow Run**
   - Planning and execution are described as serial phases (plan entire DAG, then execute). In practice, long-lived content might benefit from incremental planning where new dirty subtrees are scheduled on demand. Otherwise we pay planning costs even for trivial single-segment regenerations.

Overall the architecture is sound in its move to an explicit DAG with planner/runner separation. Tightening the above areas—especially state management, deterministic hashing, and adopting a formal DAG scheduling algorithm—will make the system easier to reason about and cheaper to operate.
