# Video Segment Regeneration Plan

## Context
- The video segment editor already follows the regeneration architecture captured in `client/docs/video-starting-image-regeneration.md`: UI gathers overrides, server actions fire Inngest events, workflows publish preview/complete messages, and `lecture-editor-provider` keeps the draft cache in sync.
- Starting-image regeneration solved the biggest pitfalls (preview cache busting, avoiding premature refreshes, reusing `useAssetGenerationFlow`). The new video regeneration button must reuse those patterns to avoid regressions.
- We already have batched video generation (`generate-segment-videos`) and single-asset regeneration hooks for other media types; the goal is to add an equivalent single video regeneration path without disturbing existing flows.

## Goals & Constraints
- Trigger a new `regenerate-video-segment` Inngest function that renders a replacement video while preserving the asset ID so timelines stay intact.
- Respect cache-busting rules: the main viewer sticks to the committed `?v=<updatedAt>` URL, while previews use `previewToken`s in a modal (no flicker in the sidebar view).
- Keep regeneration state machine consistent with other assets (`useAssetGenerationFlow`, optimistic `applyAssetUpdate`, refresh only on `video-complete`).
- Merge configuration sources safely (editor override → project video defaults → existing asset → global defaults) and gracefully handle legacy assets missing `startingImageId`.

## Implementation Plan

### 1. Frontend – Update `video-segment-editor.tsx`
- Import new server actions `regenerateVideoSegmentAction`, `acceptVideoAction`, `rejectVideoAction` (to be created) and wire them into `useAssetGenerationFlow`.
- Configure the hook with `previewMessageType: "video-preview"` and `completeMessageType: "video-complete"`, `refreshOnAccept: false`, `refreshOnComplete: true`, mirroring the starting-image flow.
- Map preview payloads to a `VideoAsset` update that replaces `movieDirections`, `model`, `videoPath`, `duration`, `resolution`, `aspectRatio`, and any other mutable fields required by downstream UI.
- On acceptance, sync the local draft (`setDraft`) so the form reflects the committed movie directions/model immediately.
- Update button label/disabled logic and helper copy for video regeneration; keep the main player bound to `buildVideoAssetUrl(videoAsset, { updatedAt })`.
- Derive a preview URL via `buildVideoAssetUrl(preview, { previewToken })` and defer review to a modal (see next step) instead of swapping the main player.

### 2. Frontend – Add `VideoPreviewModal`
- Create `client/src/components/video-preview-modal.tsx` that mirrors the dialogue patterns used by `ImagePreviewModal`/`AudioPreviewModal` (same UI primitives from the design system).
- Render the preview `<video>` element, show `movieDirections`, model, resolution, duration, and any relevant metadata for reviewer confidence.
- Accept props for `isDecisionPending`, `onAccept`, `onReject`, `onClose`, and use the modal to host Accept/Reject controls so the primary canvas keeps showing the committed video (per doc gotcha #2).
- Integrate this modal into `VideoSegmentEditor`, opening it when preview arrives (`isReviewOpen && preview`) and passing the preview/committed URLs with correct cache tokens.

### 3. Server Actions & Types
- Add `client/src/app/actions/regenerate-video-segment.ts` that validates lecture ownership, ensures the video asset exists, pulls project settings, merges overrides (`movieDirections`, `model`, plus optional `resolution`/`duration` if we expose overrides later), generates a `runId`, and sends an `app/regenerate-video-segment` event carrying the merged config.
- Create `accept-video.ts` and `reject-video.ts` actions that send `app/video.accepted` / `app/video.rejected` events with the `runId`, authenticated `userId`, and `videoAssetId`.
- Export the shared event payload type (`RegenerateVideoSegmentEvent`) from the new Inngest function so the action can use it for type safety.

### 4. Inngest Workflow – `regenerate-video-segment.ts`
- Implement `regenerateVideoSegment` alongside the other single-asset workflows:
  - Register `ReplicateVideoProvider` with the video provider registry at module load.
  - Create and update a workflow run (mirroring narration/music/image regeneration) so Agent Progress tracks status.
  - Load the lecture, confirm the target video exists, and validate project access using `getProjectById`.
  - Determine effective settings by priority: user override (event payload) → `config.video` (model/resolution/duration) → existing asset fields → `DEFAULT_VIDEO_MODEL`, `DEFAULT_IMAGE_GENERATION_DEFAULTS.aspectRatio`, etc.
  - Resolve a starting image buffer: prefer `videoAsset.startingImageId` via `createLectureAssetStorage`; if absent, fall back to the legacy `startingImageUrl` field (download to buffer) or, as a last resort, regenerate a temporary image using `generateImage` and the stored `segmentStartImagePrompt`.
  - Style the movie directions with `buildStyledMovieDirections`, render the video via `generateVideo`, and persist it using `assetStorage.saveVideo(videoBuffer, videoAssetId)` so the path stays deterministic.
  - Publish a `video-preview` message containing a partial `VideoAsset` (preserving label/id, updating prompts/model/path) and a status like “Video ready for review”.
  - Wait for `app/video.accepted` / `app/video.rejected` events (timeout 30m). On rejection, mark the workflow run succeeded with `reviewOutcome: "rejected"` and exit.
  - On acceptance, reload the lecture, replace the matching entry in `videos[]` with the generated metadata (including any updated prompts/model/path), persist via `updateLectureContent`, publish `video-complete`, and mark the workflow run complete with a final status message.
  - Surface errors (missing assets, storage failures) via `publishStatus(..., "error")` so the UI shows them.

### 5. Integration & Registration
- Export the new workflow from `client/src/inngest/functions/regenerate-video-segment.ts` and register it in `client/src/app/api/inngest/route.ts`.
- Ensure `useAssetGenerationFlow`’s `mapPreviewToAssetUpdate` aligns with the payload published by the workflow so optimistic updates match the eventual DB write.
- No changes are needed in `agent-progress` (it already handles `video-preview` events), but verify that accepted/completed events match existing naming to keep analytics consistent.
- Create a documentation similar to the `client/docs/video-starting-image-regeneration.md` and highlight any nuances discovered during implementation.

### 6. Validation & QA
- Automated: run `pnpm --filter tutopanda-client type-check`
- Manual smoke flow:
  1. Pick a segment, tweak movie directions, trigger video regeneration; confirm the preview modal loads the new asset (URL includes `?preview=` token) while the main pane keeps the committed video.
  2. Accept the preview; ensure the modal closes, the button resets, the timeline updates only after the `video-complete` event (no stale fetch), and the committed viewer now fetches via a fresh `?v=timestamp`.
  3. Reject a preview and confirm the draft keeps the edited directions, `preview` state clears, and no DB change occurs.
  4. Regenerate the starting image followed by the video to verify the flows remain independent and cache busting still works.
  5. Check Agent Progress for the run to ensure statuses and preview thumbnails appear as expected.

## Open Questions & Risks
- **Legacy assets**: decide whether to auto-generate a temporary starting image when `startingImageId`/storage is missing or to surface a user-facing error; implementation should log and publish a clear status either way.
ANSWER: If it is missing, we should surface a user facing error that explains. Don't over complicate.
- **Storage overwrite safety**: confirm `assetStorage.saveVideo(videoBuffer, videoAssetId)` overwrites the existing file without leaving stale artifacts (same assumption as other regenerations).
ANSWER: Yes correct. We should not let stale artifacts accumulate as when a lot of users use this, this will mushroom our storage costs.
- **Duration drift**: if providers return videos with mismatched duration/resolution, ensure we update metadata to reflect the actual output or expose guardrails in the workflow.
ANSWER: Let's not worry about this, this is an edge case that I don't think it happens with any providers especially for video generation. 
