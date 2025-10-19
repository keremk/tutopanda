# Generation Error Handling & Retry Plan

## 1. Objectives

- Deliver a unified error-handling strategy across image, video, narration, and music generation pipelines.
- Allow Inngest to retry genuinely transient provider failures (configurable, default 3 attempts) without blocking other assets.
- Persist structured failure metadata so partially successful runs leave actionable placeholders instead of hard-stopping the workflow.
- Surface generation failures in the editor UI (timeline + asset editors) with clear messaging, prompts/models, and regeneration affordances.
- Lay the groundwork to extend the same approach to upstream LLM prompt-generation stages in a future iteration.

## 2. Current Gaps

- **Provider layer:** Only image generation maps Replicate errors to `MediaGenerationError`. Audio, music, and video providers still throw raw exceptions with no retryability signal.
- **Core utilities:** Image batch helpers return `{ ok, error }` but audio/music/video still expect raw buffers, forcing orchestrators to treat every exception as fatal.
- **Orchestrators:** Audio, music, and video orchestrators assume all items succeed. They do not tag failed assets, save partial progress, or expose prompts/models when something goes wrong.
- **Inngest functions:** `step.run` blocks fail-fast; there is no per-asset retry loop or differentiation between soft vs. hard failures. A single segment failure can abort the entire lecture workflow.
- **Persistence & schema:** `ImageAsset` (and other assets) schemas lack status/error fields. Timeline assembly throws when any required asset set is empty, preventing partial playback.
- **UI:** Timeline clips are always rendered with success colors. Editors (visuals, narration, music, video) show generic errors but not provider messages or required user actions.

## 3. Proposed Architecture

### 3.1 Error Model

- Extend `MediaGenerationErrorCode` with domain-wide codes (`SENSITIVE_CONTENT`, `RATE_LIMITED`, `TRANSIENT_PROVIDER_ERROR`, `PROVIDER_FAILURE`, `UNKNOWN`).
- Guarantee every provider throws `MediaGenerationError` with:
  - `code`: internal category for UI + retry logic.
  - `providerCode`: optional upstream identifier (e.g. Replicate E005).
  - `isRetryable`: `false` for policy violations/sensitive content, `true` for timeouts/throttling.
  - `userActionRequired`: `true` when human intervention (prompt tweak, model swap) is needed.
  - `context`: optional map for prompt preview, duration, clip id (log-only).
- Document known Replicate codes (see `client/plans/inngest-error-handling/replicate-errors.md`) and map undocumented but observed responses (like sensitive-content E005) into the appropriate category.

### 3.2 Result Types & Status Flags

- Promote the image result tuple pattern to all generators:
  - `ImageGenerationResult`, `AudioGenerationResult`, `MusicGenerationResult`, `VideoGenerationResult` with `{ ok: true, asset } | { ok: false, error }`.
  - `asset` variant retains buffer/duration plus `debug` metadata (prompt, model) for persistence.
- Introduce asset-level status enums:
  - `generated` (success), `retrying` (internal), `needs_prompt_update` (provider rejected content), `failed` (exhausted retries).
  - Store `error` object `{ code, message, providerCode, provider, retriedCount }` directly on the asset payload.

### 3.3 Persistence & Schema Changes

- Update Zod schemas in `types.ts` for `imageAssetSchema`, `videoAssetSchema`, `narrationAssetSchema`, `musicAssetSchema` to accept `status` and `error` fields (strict string unions + nested object schema).
- Ensure lecture content migrations (if any) default existing assets to `generated`.
- Adjust timeline clip schemas to optionally carry `status`/`error` mirrors so UI can determine styling without re-querying assets.

### 3.4 Inngest Retry Strategy

- Wrap per-asset generation inside `step.run` blocks with retry policies: `retry: { limit: CONFIG_RETRY_LIMIT (default 3), backoff: { factor: 2, delay: 'PT5S' } }`.
- On `MediaGenerationError.isRetryable === false`, short-circuit retries (throw custom `NonRetryableGenerationError` that Inngest treats as terminal for that step).
- Accumulate results in-memory and persist after each stage to avoid losing successful assets if a later item fails.
- Publish progress events that differentiate `generated`, `retrying`, `failed` to keep the agent UI honest.

### 3.5 Timeline Assembly & Playback

- Relax hard requirements in `assembleTimeline`:
  - Skip missing assets while recording `missingReason` for each segment.
  - Produce placeholder clips with `status: 'failed'` so the timeline still renders uniformly sized slots.
- Update `flattenTimelineClips` utilities to expose `status` and `error` for UI components.

### 3.6 Frontend Experience

- **Timeline:**
  - Accept clip-level status and render failed items with red background (`bg-destructive/70`) + tooltip summarizing the error.
  - Optionally overlay an icon (e.g. `AlertCircle`) to make the failure obvious.
- **Editors (visuals, narration, music, video):**
  - When the selected asset has `status !== 'generated'`, display a dismissible red banner at the top with provider message, prompt, model, and call-to-action (regenerate/edit prompt).
  - Disable accept/reject actions until a successful regeneration replaces the failure.
  - Pre-fill editors with last prompt/model even if no asset URL exists so the user can immediately iterate.
- **Agent/Progress Panel:**
  - Log granular messages when assets move to `failed` state after max retries and highlight the next action (e.g. “Edit prompt in Visuals editor”).

## 4. Implementation Phases

### Phase 1 – Core Type & Provider Groundwork

1. Expand `MediaGenerationError` codes and helper utilities in `client/src/services/media-generation/core/types.ts`.
2. Wrap audio, music, and video providers (Replicate + any others) with error mapping similar to the image provider.
3. Introduce `{ ok, error }` result discriminants for audio, music, and video generators; update shared mocks/tests.
4. Unit tests: add provider-level tests simulating rate limit, sensitive-content, and network failures to ensure classification.

### Phase 2 – Orchestrator Adaptation

1. Modify audio (`audio-orchestrator.ts`), music (`music-orchestrator.ts`), and video (`video-orchestrator.ts`) orchestrators to:
   - Accept arrays of `GenerationResult` objects.
   - Persist assets with `status`/`error` metadata when generation fails.
   - Prevent throwing unless an unexpected, non-typed error arises.
2. Align regeneration flows to return `needs_prompt_update` with error payloads when providers decline content.
3. Update Vitest suites (`audio-orchestrator.test.ts`, `music-orchestrator.test.ts`, video tests) to cover partial failures and verify persistence of prompts/models.

### Phase 3 – Inngest Workflow Enhancements

1. Ensure provider registries are initialised with new error handlers.
2. Modify generation functions (`generate-segment-images.ts`, `generate-narration.ts`, `generate-music.ts`, `generate-segment-videos.ts`) to:
   - Wrap each segment inside its own `step.run('generate-segment-X', async () => ...)` so retries happen per asset (per [Inngest retries docs](./inngest-error-handling/retries.md)).
   - Provide explicit retry configuration via the step’s `retry` option or `step.retry()` helper (limit set by `MEDIA_GENERATION_MAX_RETRIES`, exponential backoff matching Inngest defaults).
   - Catch `StepError` (thrown when a step exhausts retries) to convert the failure into persisted asset metadata instead of aborting the function.
   - Throw `new NonRetriableError(...)` when `MediaGenerationError.isRetryable === false` (e.g. sensitive content) so Inngest stops retrying immediately and the step transitions to failure without additional attempts (per [failure-handlers guidance](./inngest-error-handling/failure-handlers.md)).
   - Emit `RetryAfterError` when the provider returns rate-limit hints to align retry scheduling with upstream backoff semantics.
   - Record retry counts (available via `attempt`) and final status (success/failure) for each asset.
   - Publish granular progress events (e.g. `image-generation-retry`, `image-generation-failed`).
3. For non-retryable errors (`userActionRequired === true`), short-circuit the retry loop by throwing `NonRetriableError` (with the provider message and code) and immediately persist a `needs_prompt_update` entry.
4. Ensure failed segments still advance the workflow so later steps (timeline, exports) are executed with partial data, catching `StepError` at the function level if necessary.
5. Extend integration tests under `client/tests/integration` to simulate both transient (retry-success) and hard failures, asserting that only failing assets are retried and that a `NonRetriableError` halts retries after the first attempt.

### Phase 4 – Persistence & Timeline Assembly

1. Update Zod schemas for assets/timeline to accept `status`/`error` and add migrations/defaults for existing content.
2. Adjust `updateLectureContent` consumers to merge new fields safely.
3. Refactor `assembleTimeline` and timeline builders to:
   - Create placeholder clips when assets are missing or flagged as failed.
   - Propagate `clip.status` and `clip.error` for UI consumption.
4. Provide regression tests ensuring timeline assembly does not throw when some assets failed and that clip metadata aligns with asset state.

### Phase 5 – Frontend Surface Area

1. **Timeline (`timeline-tracks.tsx`):**
   - Apply color variants (success vs. failed) and include tooltip messaging.
2. **Visuals Editor (`visuals-editor.tsx`):**
   - Display red banner with `ImageAsset.error.message` when status is not `generated`.
   - Pre-populate prompt/model fields, so the user can try with another prompt or model. The Regenarate button is ready to be clicked.
3. **Narration Editor (`narration-editor.tsx`):**
   - Similar banner + gating logic for narration failures.
4. **Background Score Editor (`background-score-editor.tsx`):**
   - Show error messaging and highlight prompt/model for quick edits.
5. **Video (timeline + preview modal):**
   - Introduce UI to inspect failed segment videos, view prompts/directions, and trigger regeneration.
6. Update the agent/progress UI to reference the new statuses and guide the user toward the appropriate editor tab.
7. E2E smoke (Playwright or manual script) to confirm the editor shows red indicators and allows regeneration flow end-to-end.

### Phase 6 – Observability & Configurability

1. Expose retry limit via environment variable (e.g. `MEDIA_GENERATION_MAX_RETRIES`).
2. Emit structured logs (`code`, `providerCode`, `retries`) to aid monitoring.
3. Add metrics counters (if applicable) for failed assets vs. total attempts to validate improvements post-launch.

## 5. Follow-Ups / Out of Scope

- Extending the same retry/error mechanics to upstream LLM prompt generation (not covered in this iteration, but enabled by the new architecture).
- UX improvements for batch editing prompts en masse (potential future enhancement once individual failure handling ships).
- Database migrations or analytics dashboards beyond schema updates described above.

---

**Next Step:** Begin Phase 1 by extending core error types and updating all providers to return typed results, then cascade the changes down the stack as outlined.
