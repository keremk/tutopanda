# Inngest Refactor Plan (Parallel Per-Asset Steps Without Rewriting Orchestrators)

## Guiding Principles

1. **Keep orchestrators as thin, pure helpers**: they already encode batching, logging shape, and persistence. We won’t throw them away; instead we’ll reuse their building blocks (prompt generation, per-asset generation helpers, persistence routines).
2. **Expose per-asset outcomes**: recent work allows batch helpers (`generateImagesThrottled`, etc.) to return `{ ok, error }` results. We’ll call those helpers from Inngest steps.
3. **Use Inngest parallel steps**: Inngest supports running multiple `step.run` calls in parallel via `Promise.all`. We’ll launch one step per asset (or per small chunk) so retries are isolated, but we still respect our desired concurrency.
4. **Chunk work to retain concurrency limits**: Instead of the orchestrator using `batchWithConcurrency`, the Inngest layer will build small chunks (e.g. size 5) and execute each chunk’s steps concurrently with `Promise.all`. This preserves provider concurrency limits while giving Inngest observability per asset.

## High-Level Structure (Example: `generate-segment-images`)

```
inngest.createFunction(..., async ({ step, event }) => {
  // 1. Validation / skip logic (single step)
  await step.run("validate", () => validateAccess(...));

  // 2. Prompt generation (single step)
  const prompts = await step.run("generate-prompts", () =>
    orchestrator.generatePrompts(...)
  );

  // 3. Image generation per prompt, chunked
  const chunkSize = 5;
  const imageResults = [];

  for (const chunk of chunkPrompts(prompts, chunkSize)) {
    const chunkSteps = chunk.map((prompt) =>
      step.run(`image-${prompt.segmentIndex}-${prompt.imageIndex}`, () =>
        orchestrator.generateSingleImage(prompt, config, deps)
      )
    );

    const chunkResults = await Promise.all(chunkSteps);
    imageResults.push(...chunkResults);
  }

  // 4. Persist aggregated results (single step)
  await step.run("persist-images", () => orchestrator.persistImages(imageResults));

  // 5. Publish final status
  publishStatus(imageResults);
});
```

Key observations:
- The orchestrator helper `generateSingleImage` reuses the underlying pure function (e.g. `generateImage`) and returns `{ ok, buffer } | { ok: false, error }` along with metadata (segment index). It does **not** persist; it just performs the unit of work.
- Each `step.run` is launched but not awaited immediately; instead we collect the promises in a chunk and await via `Promise.all`, which triggers parallel execution per chunk.
- Chunking ensures we don’t exceed provider concurrency limits while still letting Inngest manage each asset individually (retry, observe status).
- After we collect all results, we run the existing orchestrator persistence logic once to update `updateLectureContent` with successes and failures.

## Applying the Pattern to Other Functions

### `generate-narration`
1. **Validation step** – fetch lecture, check skip.
2. **Per-segment steps** – build `step.run` calls for each segment using `generateSingleNarration` helper (wrapping `generateAudio`). Use chunking + `Promise.all` exactly as images.
3. **Persistence step** – call existing orchestration function to merge narration assets.

### `generate-music`
- Usually a single asset: keep a single `step.run`. If future requirements call for multiple tracks, chunk as above.

### `generate-segment-videos`
1. **Validation step**.
2. **Prompt generation step**.
3. **Starting images** – chunked parallel `step.run` calls for each segment, using `generateSingleStartingImage` helper.
4. **Video generation** – for segments whose starting image succeeded, launch parallel `step.run` calls for video creation. For segments where the image failed, skip video step and record failure.
5. **Persistence step** – combine results and invoke existing persistence logic.

## Helper Functions (Minimal Orchestrator Changes)

We introduce a new layer of small, pure helpers under each orchestrator folder for per-asset generation:

- `image-orchestrator/single-image.ts` – wraps `generateImage` and returns `ImageAsset` or failure record with metadata.
- `audio-orchestrator/single-audio.ts` – wraps `generateAudio` similarly.
- `music-orchestrator/single-music.ts` – wraps `generateMusic`.
- `video-orchestrator/single-starting-image.ts` and `single-video.ts` – handle per-stage video generation.

Each helper:
- Receives prompt/config + context (segment index, runId).
- Calls the corresponding generator (already handles provider errors + logging).
- On success: returns `{ ok: true, asset, metadata }` without persisting.
- On non-retryable failure (`userActionRequired`): returns `{ ok: false, error }`.
- On unexpected error: wraps into a `MediaGenerationError` and returns failure.

## Persistence Functions

- After collecting `imageResults` / `audioResults` / etc., call the existing orchestrator persistence method (or a new `persistAssets` helper) inside a final `step.run`.
- The persistence step uses `updateLectureContent` exactly as today; it simply receives arrays of assets with `status`/`error` fields.

## Progress Publishing

- After each chunk completes, iterate through the chunk’s results and publish progress messages (success or failure). Because chunk steps finish via `Promise.all`, we know which steps completed together.

## Error Semantics & Retry Behavior

- Inside per-asset helper, use the existing `MediaGenerationError` classification:
  - For retryable errors (rate limit, transient): throw the original error from the step so Inngest retries automatically.
  - For non-retryable errors (sensitive content): return `{ ok: false, error }` and allow the step to succeed (no exception), keeping the failure recorded in the result.
  - For unknown errors: wrap in `MediaGenerationError` with `code: "UNKNOWN"` and throw to prevent silent failures.
- Because each asset runs in its own `step.run`, a single failure only affects that asset’s step; others continue.

## Implementation Roadmap

1. **Helper Extraction**
   - Add per-asset helper functions in orchestrator modules (image/audio/music/video). Ensure helpers are pure and return structured results.

2. **Refactor Inngest Functions**
   - Each function (`generate-segment-images`, `generate-narration`, `generate-music`, `generate-segment-videos`) will:
     - Perform validation/skip checks in existing steps.
     - Generate prompts or other shared data in one step.
     - Iterate segments in chunks, building arrays of `step.run` calls. Use `Promise.all(chunkSteps)` to execute concurrently per chunk.
     - Accumulate results, publishing progress after each chunk.
     - Persist aggregated results in a final step.

3. **Testing**
   - Create Vitest integration tests for each Inngest function using mocked `step.run` behavior to ensure chunking + retries behave as expected.
   - Ensure manual QA includes tests for valid prompts, sensitive content, and transient failures (any single failure should not re-run successful assets).

4. **Documentation & Cleanup**
   - Update `generation-error-handling-plan.md` with specifics of the new Inngest pipeline.
   - Note limitations (e.g., 4MB step state, 1,000 step limit) and chosen chunk size defaults.

## Why This Preserves Orchestrators

- Orchestrators still define prompt generation, asset assembly, and persistence. The difference is we now expose a single-asset helper for Inngest to call per step.
- Batch concurrency (`batchWithConcurrency`) is effectively replaced by chunking + `Promise.all` within Inngest steps, giving us both parallel provider calls and isolated retries.
- Tests for orchestrators remain valid (they still aggregate results the same way) and our new per-asset helpers can be unit tested easily.

## Timeline Estimate

1. Helper extraction & unit tests: 1–2 days.
2. Refactor image/audio/music Inngest functions: 2–3 days combined.
3. Refactor video Inngest function (multi-stage): 2 days.
4. Integration tests + docs: 2 days.

_Total: Approximately 7–9 engineering days._

