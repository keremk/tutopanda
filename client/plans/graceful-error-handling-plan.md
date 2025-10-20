# Graceful Error Handling Completion Plan

Objective: ensure every media generation pipeline (images, narration, music, videos, starting images) can finish with partial failures captured in asset metadata (`status`/`error`), while the overall workflow continues to the next step. No Inngest retry refactor—just full coverage of the new status/error handling.

## 1. Audit & Align Orchestrators

- **Image / Audio / Music / Video orchestrators** already return assets with `status`/`error` fields. Double-check they never throw for provider failures and always emit a final summary log with generated/failed counts.
- Confirm regeneration helpers mirror the same behaviour (e.g., `regenerateImage`, `regenerateAudio`, `regenerateMusic`, video regeneration utilities).
- Verify asset persistence happens inside orchestrators only when `status === "generated"` so failures don’t attempt storage writes.

## 2. Verify Inngest Functions Compatibility

- Review each Inngest function that invokes an orchestrator:
  - `generate-segment-images`
  - `generate-narration`
  - `generate-music`
  - `generate-segment-videos`
- Ensure they:
  - Treat orchestrator success even when some assets have `status !== "generated"` (i.e., do not throw or consider it failure).
  - Publish progress messages summarising generated vs failed counts after orchestrator completes.
  - Persist lecture content using the returned asset arrays (no extra filtering that would drop failures).

## 3. Testing Enhancements

- **Orchestrator Tests**
  - Add/extend tests covering partial-failure scenarios for:
    - `generateLectureImages`
    - `generateLectureAudio`
    - `generateLectureMusic`
    - `generateLectureVideos` (both starting-image failure and video failure)
  - Verify saved assets include `status`/`error` and that storage writes only occur for successful assets.
- **Inngest-Level Smoke Tests (Unit-style)**
  - Write minimal tests for each Inngest function using mocked orchestrator responses returning mixed success/failure to ensure the function still returns a non-error result and logs/publishes correctly.
  - Validate lecture content update payloads include failing assets.
- Update existing mocks in `client/src/services/media-generation/__test-utils__/mocks.ts` if needed to support `{ ok, error }` shapes.

## 4. Persistence & Timeline

- Confirm timeline assembly (already updated) receives assets with `status`/`error` from DB and produces placeholder clips.
- Add a unit test that passes a lecture content snapshot with mixed statuses to ensure placeholder clips appear only for failed assets.

## 5. Documentation & Release Notes

- Update `client/plans/generation-error-handling-plan.md` (and the progress log) with final behaviour description.
- Draft a short engineer-facing note: “Partial failures now surface through asset `status`/`error` fields; timeline shows placeholders; users can regenerate from edit view.”

## 6. Manual QA Checklist

- Run `generate-segment-images` with a known sensitive prompt causing one failure; verify four successes persisted, one asset flagged `needs_prompt_update`, timeline shows placeholder.
- Repeat for narration and music using simulated failures (e.g., intercept provider call to throw `SENSITIVE_CONTENT`).
- Generate video lecture where one starting image fails; ensure subsequent steps complete and final video list marks failure.
- From the UI edit view, confirm regenerate flow succeeds after tweaking prompt.

## 7. Out-of-Scope / Follow-Ups

- Inngest retry refactor (parallel per-asset steps) remains deferred.
- UI banner and timeline styling changes can follow once backend data is confirmed.
- Telemetry/metrics for failed assets can be added later if desired.

