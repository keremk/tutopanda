# Generation Error Handling – Work-in-Progress Notes

_Last updated: (pending build)_

## Completed Work This Session

1. **Core Error Infrastructure**
   - Extended `MediaGenerationError` in `client/src/services/media-generation/core/types.ts` (new codes, retry hints, helper factory).
   - Added `mapReplicateErrorToMediaError` utility and re-exported from `core/index.ts`.

2. **Provider Wrappers & Generators**
   - Image/Audio/Music/Video Replicate providers now classify upstream errors via `mapReplicateErrorToMediaError` and raise structured failures when downloads or outputs are missing.
   - Image/audio/music/video generators catch `MediaGenerationError`s, log structured metadata, and wrap unknown exceptions as `UNKNOWN` errors.

3. **Batch Utilities**
   - `generateImagesThrottled`, `generateAudiosThrottled`, and `generateMusicsThrottled` return discriminated outcomes (`{ ok: true } | { ok: false, error }`) and synthesize fallback errors for unexpected failures.

4. **Schema Updates**
   - Introduced shared `assetStatusValues`/`assetErrorSchema` in `client/src/types/types.ts`.
   - Augmented image, narration, music, video assets and all timeline clip schemas to accept optional `status`/`error` fields.

5. **Orchestrators**
   - **Image:** `generateLectureImages` / `regenerateImage` consume new batch results, persist statuses, log summary counts, and tests now cover success + sensitive-content paths.
   - **Audio:** Orchestrator/regeneration updated similarly, with new tests for success and sensitive-content errors.
   - **Music:** Orchestrator/regeneration updated to handle partial failures; tests cover success and `needs_prompt_update` scenarios.
   - **Video:** `generateVideoStartingImages` and `generateVideoAssets` produce structured results, block segments when starting images fail, log aggregate counts, and tag video assets with status/error metadata.

6. **Timeline Assembly**
   - Visual track builder now respects asset status, generates placeholder clips when both video and images fail, and tests cover the new behavior.

7. **Test Suite Adjustments**
   - Updated image/audio/music orchestrator tests to work with `{ ok, error }` outcomes and to assert `status` / `error` metadata.
   - Added new tests for audio/music/image orchestrators covering sensitive-content failures.
   - Added new video orchestrator helper tests (success, image-blocked, provider failure) and extended timeline assembler tests.
   - Added unit tests for provider error mapping and generator fallback wrapping (`replicate-error.test.ts`, `generator-fallback.test.ts`).
8. **Inngest Functions**
   - Updated generation functions to summarize partial successes/failures, publish informative status messages, and log structured counts without aborting the workflow.

## Still To-Do

1. **Schema Consumers**
   - Review `updateLectureContent` callers (and any data mappers) to ensure new `status`/`error` fields flow end-to-end without stripping.

2. **Testing Strategy Follow-up**
   - Implement integration tests (or targeted harness tests) simulating Inngest retries/failures once functions are updated.
   - Since vitest CLI currently fails in this environment, plan to run the suite locally after changes (documented in final notes).

3. **Documentation & QA**
   - Once all orchestrators and Inngest flows are updated, refresh the testing checklist and document the new error-handling behavior for internal stakeholders.

## Notes

- TypeScript `pnpm --filter tutopanda-client type-check` passes with current changes.
- Vitest commands still fail in this sandbox (`pnpm ... test:run`) – highlight this in final delivery so tests can be executed locally.
- UI work remains out of scope for now; once backend plumbing stabilizes we can hook up timeline/error banners.

---

_Use this file as the handoff checkpoint before resuming implementation._
