 Investigation Summary

  - generateSegmentVideos currently wraps prompt generation, starting-image generation, and final video rendering inside one Inngest
    step (generate-lecture-videos). When a single segment fails, Inngest retries that entire step, so all three phases rerun and the
    user receives duplicate progress updates.
  - The orchestrator (generateLectureVideos) already models the pipeline as three sequential phases, but it operates in-process.
    Because the Inngest function treats the entire orchestrator call as one step, Inngest has no per-phase checkpoints to resume from,    which explains the repeated notifications you saw.

  Implementation Plan

  1. Stage Helpers in the Orchestrator
      - Keep the existing orchestrator architecture but extract the three phases into exported helpers that mirror the image
        orchestrator style:
        a. generateVideoSegmentPrompts → returns the prompt metadata for each segment.
        b. generateVideoStartingImages → accepts those prompts plus config, calls the existing image generator, persists each
        starting image through assetStorage.saveImage, and returns metadata (segmentIndex, imageId, imageUrl). No buffers cross stage
        boundaries.
        c. generateVideoAssets → accepts the prompts and saved-image metadata, loads each image buffer from storage via
        setupFileStorage().read(imageUrl), and calls the existing video generator to produce and persist videos. Maintain
        batchWithConcurrency usage across all helpers for parity with the current implementation.
  2. Refactor generateLectureVideos Wrapper
      - Recompose the orchestrator using the new helpers so tests and other callers retain the same entry point, preserving dependency        injection hooks (generatePrompts, generateImageFn, generateVideoFn, etc.).
      - Update internal type definitions to move them top-level and return serializable metadata structures (no buffers) from stage
        helpers.
  3. Restructure generateSegmentVideos Inngest Function
      - Replace the single generate-lecture-videos step with three sequential steps that invoke the new helpers:
        a. step.run("generate-video-prompts", …) → calls generateVideoSegmentPrompts, publishes “Generating prompts…” updates.
        b. step.run("generate-starting-images", …) → calls generateVideoStartingImages, publishes “Generating starting image…”
        updates.
        c. step.run("generate-segment-videos", …) → calls generateVideoAssets, publishes “Generating video…” updates.
      - Keep the surrounding steps (skipping logic, access validation, persistence) unchanged, and continue to publish the same
        completion message once videos are saved.
  4. Progress Messaging
      - Ensure each helper triggers the existing progress callbacks (onPromptProgress, onImageProgress, onVideoProgress) so agent-
        progress.tsx receives updates identical to the current behavior, only now isolated per Inngest step.
      - Emit a descriptive status before each step starts and on completion to maintain the user-facing timeline.
  5. Testing & Verification
      - Update any orchestrator tests (if present) to exercise the new helpers.
      - Run pnpm --filter tutopanda-client type-check after refactor; optionally execute an end-to-end Inngest dry-run to confirm
        retries are scoped to the failing stage.

  Let me know and I’ll start refactoring with this plan.