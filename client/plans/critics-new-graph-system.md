# Critique: Dependency Graph System vs. Current Inngest Orchestration

## Context Reviewed
- New plan: `client/plans/dependency-graph-system.md`
- Existing orchestrators: `client/src/services/lecture/orchestrators/*.ts`
- Current workflow entrypoint: `client/src/inngest/functions/start-lecture-creation.ts`
- Progress UI plumbing: `client/src/components/agent-progress.tsx`
- Vercel Workflow primer: `client/docs/vercel-workflow/overview.md`

## Highlights Worth Keeping
- Graph-first regeneration promises surgical re-runs and clear lineage.
- Pure-function core (`builder`, `planner`, `dirty-propagation`) with unit tests encourages safer iteration.
- Phased rollout (Phase 4 feature flag) provides space for coexistence, aligning with our need to ship alongside Inngest.

## Critical Gaps & Risks
- **Replacement vs. dual-run conflict**: The plan states “This single workflow replaces ALL existing Inngest generation functions” (`client/plans/dependency-graph-system.md:366-372`), yet we must keep the Inngest path alive. We need an explicit coexistence strategy: entry-point router, shared storage shapes, and a reversal plan if Vercel Workflow stalls.
ANSWER: Come to think of it, since the app is not deployed yet, I will just create a new branch with this new architecture until it works. So no need for coexistance as it will complicate things.

- **Graph cardinality relies on guesses**: `buildDependencyGraph` assumes `numSegments` is known up front (`client/plans/dependency-graph-system.md:168-171`), but Inngest currently derives the real segment count from `createLectureScript` responses (`client/src/inngest/functions/start-lecture-creation.ts:58-118`). We risk building nodes that never materialize or missing surprise segments. We need a reconciliation step (e.g., “graph draft” → script emitted actual segments → graph rebuilder diff).
ANSWER: Currently it is the case, but I want to make it deterministic. Basically every segment will be 10s (+/- %5 based on the narration duration) and the # of segments will just be the total # of seconds (always a multiple of 10) divided by segment length. We will remove the configurability of segment length from the edit-general-configuration (it is not useful anyways) => So no need for reconciliation step to keep things simple.

- **Execution loop ignores mid-run mutations**: The pseudocode keeps a single in-memory `graph` copy and never refreshes it after `markClean` (`client/plans/dependency-graph-system.md:379-409`). In practice, every save should bump the optimistic `version` and the loop must reload or at least mutate the local structure; otherwise dependency results stay stale, and retrying nodes in the same run will read outdated state.
ANSWER: Good point. I am thinking perhaps having a graph that is immutable for the plan, it tells basically where 

- **Generator abstraction gap**: `executeNode` expects dedicated step functions (`client/plans/dependency-graph-system.md:393-419`), but our orchestrators (`client/src/services/lecture/orchestrators/image-orchestrator.ts:60-200`, `.../video-orchestrator.ts:20-210`, etc.) already bundle prompt batching, concurrency limits, storage, and progress hooks. Rewriting them into granular node handlers invites divergence. We should instead wrap existing orchestrators as graph executors to preserve the tuned batching logic and concurrency safeguards (`batchWithConcurrency`, throttle limits, provider registry registration).
- **Data model inflation**: Persisting every node’s `assetData` JSON inside `video_lectures.dependency_graph` inflates a hot table and complicates partial updates. Today we store assets via `updateLectureContent` (`client/src/inngest/functions/generate-segment-images.ts:156-205`). Consider splitting graph metadata (dependencies + status) from heavyweight blobs (script text, narration URLs) to avoid write-amplification and keep Postgres row size manageable.
- **Progress + audit trail parity**: Inngest publishes granular status events through `createLectureProgressPublisher` (`client/src/inngest/functions/generate-segment-images.ts:85-122`, `generate-segment-videos.ts`, etc.). The plan references console logging only; without parity we break `AgentProgress` (`client/src/components/agent-progress.tsx:25-196`). We must spec the event surface, retention, and delivery semantics before cutting over.
- **Skip/resume semantics**: Current functions guard against redundant work (e.g., reusing existing images if not forced, `client/src/inngest/functions/generate-segment-images.ts:103-142`). The proposed graph executor lacks a story for “node already clean but result missing” or “regenerate only if flagged.” We need lifecycle fields that capture both desired and actual asset existence, perhaps with integrity checks when reading dependencies.
- **Operational ownership**: Vercel Workflow introduces new tooling (workflow CLI, dash). Plan doesn’t outline deployment, secret management, local dev parity, or fallbacks when Vercel workflow regions are unavailable. The existing Inngest stack is already wired into observability and access controls.
- **Testing strategy mismatch**: Unit tests for graph helpers are great, but we also need story-based integration suites that exercise orchestrators end-to-end under the new driver. The plan’s Phase 5 mentions e2e tests, yet test harness choices (Vitest? Workflow emulator?) are unspecified.

## Compatibility Concerns with Current Orchestrators & Data Flows
- Orchestrators depend on injected storage (`createLectureAssetStorage`) and provider registries initialised at module load (`client/src/inngest/functions/generate-segment-images.ts:66-79`). The new workflow steps must preserve those global side effects; otherwise providers might never register inside the Vercel execution runtime.
- The Inngest path manages workflow bookkeeping (`updateWorkflowRun`, resume/cancel actions) used by the UI (`agent-progress.tsx:61-112`). Without equivalent APIs from the graph executor, cancel/rerun buttons will break.
- Lecture-level updates currently flow through `updateLectureContent` and rely on transactional writes to keep lecture state consistent. Writing raw `assetData` into graph nodes risks drifting from the canonical lecture schema unless we continue to upsert via the same service layer.
- Feature flags should likely live at the workflow trigger layer (e.g., choose between `startLectureCreation` vs. `executeLecturePlan`) but the plan does not map out how to maintain schedule-based triggers, retries, or manual reruns across both systems without duplicating action endpoints.

## Streaming Progress & Durable Notifications Proposal
1. **Event sink**: Every workflow run (Inngest or Vercel) writes progress entries to a Redis Stream keyed by `lecture:{runId}`. Use `XADD` with `MAXLEN ~ 5000` to bound memory while preserving replay. Payload schema mirrors today’s messages (`LectureStatusMessage`, previews, reasoning).
2. **Workflow integration**: Generator steps call a shared `publishProgress` helper. For Redis, wrap it in an async function that can batch writes and degrade gracefully if Redis is unavailable (fallback to console + error telemetry). This helper should also emit to the existing Inngest channel when the legacy path is active, so both systems feed the same sink during migration.
3. **Delivery to UI**: Replace `useInngestSubscription` with a thin abstraction that first replay-fetches the stream (`XRANGE` from `-` to `+`), then tails it via `XREAD` with `BLOCK`. Expose this over an authenticated Next.js Route Handler using Server-Sent Events (SSE) so the browser keeps a single connection and can resume by last message ID.
4. **Reconnect handling**: On reconnect, the client sends the last seen stream ID; the server resumes with `XREAD` from that offset, guaranteeing no gaps even if the tab was closed. If the Redis entry expired (`XADD` maxlen overflow), fall back to `getWorkflowHistoryAction` for archival history before resuming live tailing.
5. **Operational considerations**: Choose a managed Redis with persistence (Upstash, Vercel KV with streaming wrapper). Keep secrets in existing env management. Add metrics for stream lag and dropped connections.
6. **Migration path**: Start dual-writing from the Inngest workflow so `AgentProgress` can switch consumers without waiting for the Vercel workflow. Once verified, point the component to the Redis-backed transport and deprecate direct Inngest realtime usage.

## Open Questions / Follow-Ups
- How will we reconcile graph-produced asset metadata with the canonical lecture row when partial regenerations occur?
- Do we expect Vercel Workflow to call into the same storage utils (`setupFileStorage`) that rely on environment-specific file systems, and are those available inside the workflow runtime?
- What’s the plan for permissioning and audit logging when multiple systems can trigger regeneration? Should graph updates be wrapped in DB transactions to keep `dependency_graph` and asset tables in sync?
- Can we prototype the Redis-backed progress sink while still on Inngest to validate durability and replay semantics before layering on the graph executor?

Addressing the gaps above before implementation will reduce rework, keep the orchestrator logic aligned, and give us a migration path that respects the existing UI contracts.

## Parallel Execution Plan Sketch
- **Stage detection**: After marking dirty nodes, run a layered topological sort that emits ordered `ExecutionStage` buckets. Each stage only contains nodes whose dependencies are already clean/queued in earlier stages. This preserves data flow while exposing the natural parallel fan-out visible in `plans/Generation Diagram.png`.
- **Batch metadata**: When building stages, tag nodes with an optional `batchKey` and `concurrencyHint`. For example, all `asset:image:segment[x]` nodes share the `asset:image` batch key with a `concurrencyHint` of 5. Nodes without a batch key run as singletons.
- **Plan format**:
  ```ts
  type ExecutionPlan = {
    stages: Array<{
      stageIndex: number;
      groups: ExecutionGroup[];
    }>;
  };

  type ExecutionGroup =
    | { kind: "single"; nodeId: string }
    | {
        kind: "batch";
        batchKey: string;
        nodes: string[];
        concurrency: number;
      };
  ```
- **Executor strategy**: For each stage, call `await Promise.all(stage.groups.map(executeGroup))`.  
  - `executeSingle` delegates to the existing orchestrator step via `await step.run("node:"+nodeId, () => runGenerator(node))`, so Vercel handles retries/timeouts.  
  - `executeBatch` uses a small helper around `p-limit` (or even a manual queue) to issue up to `concurrency` parallel `step.run` calls. Each call wraps the orchestrator with the correct dependency payload, preserving per-node retries while keeping five concurrent providers busy.
- **Maintaining orchestrator batching**: When a group naturally maps to an existing bulk orchestrator (e.g., `generateLectureImages` already pipelines prompts and throttles outbound requests), the batch executor can call that orchestrator exactly once and fan the results back to the individual nodes before marking them clean. For groups where we want finer granularity (e.g., narration per segment), we let the batch helper schedule per-node `step.run` calls.
- **Result propagation**: Each `step.run` returns the asset metadata which the executor writes back through `markClean`. For batches, accumulate results keyed by node ID so downstream stages receive the right dependency payloads.
- **Resilience**: Because batches are composed of independent `step.run` units, a failure in one node marks only that node as failed while the rest of the batch can complete. The executor stops advancing to the next stage until all groups resolve (using `Promise.allSettled` inside `executeBatch`) and retries happen where configured.
- **Workflow structure**: The outer workflow remains a single Vercel Workflow function. It loads the graph, builds the staged plan, and iterates through stages. Inside each stage the combination of `Promise.all` and chunked `step.run` calls gives us the same concurrency advantages we have today, while still benefiting from Vercel’s suspension/retry semantics.
- **Future hooks**: The plan structure gives us a natural place to emit progress (“Stage 2: Generating 10 images in batches of 5”) to the Redis stream discussed above, and to surface estimated remaining work by counting unfinished nodes in later stages.
