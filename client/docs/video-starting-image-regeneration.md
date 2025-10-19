# Video Segment Editing & Starting-Image Regeneration

This document captures the full architecture for the video segment editor, how we regenerate starting images, and the cache-busting strategy that keeps previews and committed assets in sync. Use this as a reference when extending the workflow or fixing regressions.

---

## 1. High-Level Flow

```
Client (video-segment-editor) ──┐
                               │ regenerateVideoStartingImageAction
                               ▼
                       Inngest (app/regenerate-video-starting-image)
                               │
                 generate new starting image via orchestrator helpers
                               │
                    publish preview → UI review/accept/reject
                               │
                 update lecture.videos[] on acceptance (same ID)
                               │
                    publish completion → client refreshes cache
```

### Roles

| Layer            | Responsibility                                                                         |
|------------------|-----------------------------------------------------------------------------------------|
| **Editor UI**    | Collect edits, display previews, manage in-flight state, call server actions.           |
| **Server action**| Validate access, fetch project settings, fire the Inngest event with overrides.         |
| **Inngest fn**   | Regenerate the image, publish preview/completion events, persist accepted results.      |
| **Lecture store**| `lecture-editor-provider` keeps an in-memory draft, applies preview deltas, and refreshes from the server when the workflow finishes. |

---

## 2. Data Model & Storage

### VideoAsset Fields

| Field                 | Purpose                                                     |
|-----------------------|-------------------------------------------------------------|
| `videoPath`           | Relative `/user/project/lecture/videos/<video-id>.mp4` path written by the orchestrator. |
| `startingImageId`     | Deterministic image identifier (`video-img-<run>-<segment>`). |
| `startingImageModel`  | Image model used for the latest accepted starting image.     |
| `segmentStartImagePrompt` | User-editable prompt stored alongside the asset.      |

We **never** persist full URLs. The helper `buildStartingImageUrl(video, …)` reconstructs `/api/storage/<base>/images/<startingImageId>.jpg` and adds query parameters via `buildAssetUrl`.

---

## 3. Client-Side Architecture

### 3.1 `video-segment-editor.tsx`

* Keeps user edits in a `useAssetDraft` state: prompt, video model, starting-image model.
* Renders two tabs:
  * **Video Generation** – currently still “coming soon”.
  * **Starting Image** – holds the prompt/model inputs and the live preview image.
* Derives URLs:
  * `committedStartingImageUrl = buildStartingImageUrl(videoAsset, { updatedAt })`
  * `previewStartingImageUrl = buildStartingImageUrl(previewVideoAsset, { previewToken })`
* Uses `useAssetGenerationFlow` with `assetType: "video"` to manage:
  * `isGenerating`, `isReviewOpen`, `preview`, `previewVersion`
  * `startGeneration` (calls `regenerateVideoStartingImageAction`)
  * `acceptPreview` / `rejectPreview` (call corresponding actions)
* Opens the shared `<ImagePreviewModal>` (same component used by the image editor) when a preview arrives. The modal shows the preview URL, yet the main pane keeps rendering the committed URL to avoid flicker.

### 3.2 `useAssetGenerationFlow`

Enhancements specific to video starting images:

* Supports `assetType: "video"` so `applyAssetUpdate` routes to `content.videos`.
* `refreshOnAccept: false`, `refreshOnComplete: true` — prevents the client from pulling stale data immediately after acceptance. We wait for the `video-image-complete` event before calling `refreshLecture()`.
* Accept path updates `content.videos` in-place via `mapPreviewToAssetUpdate`, then resets preview state.

### 3.3 `lecture-editor-provider`

* Provides `applyAssetUpdate(type, id, payload)`; the new `"video"` branch copies and updates the matching video object.
* `refreshLecture()` hits the server only when triggered (on completion) to sync the latest revision + `updatedAt`.

---

## 4. Server Actions

### `regenerate-video-starting-image.ts`

* Validates the lecture belongs to the current user.
* Ensures the target video asset exists.
* Pulls project settings (`getProjectSettings`) to merge defaults.
* Sends an Inngest event with:
  ```ts
  {
    userId,
    runId,
    lectureId,
    projectId,
    videoAssetId,
    segmentStartImagePrompt,
    imageModel,
    config: projectSettings
  }
  ```

### `accept-video-starting-image.ts` / `reject-video-starting-image.ts`

* Emit `app/video-image.accepted` or `app/video-image.rejected`.
* No additional validation beyond session ownership—the Inngest function enforces run/asset matching.

---

## 5. Inngest Workflow (`regenerate-video-starting-image.ts`)

Steps:

1. **Create workflow run** (`createWorkflowRun`) so progress can be tracked in Agent Progress.
2. **Validate** lecture + project access.
3. **Determine settings**:
   * Use overrides in priority order: editor model > project video image model > project image model > existing asset model > repo default.
   * Pull default width/height/aspect/size from `DEFAULT_IMAGE_GENERATION_DEFAULTS` if project settings do not specify them.
4. **Generate image**
   * Create `FileStorageHandler` + `createLectureAssetStorage`.
   * Call `generateImage` on the styled prompt; save to `startingImageId`.
5. **Publish preview**
   * `publishVideoImagePreview` with a partial `VideoAsset` (same ID, updated prompt/model/path).
   * `publishStatus("Starting image ready for review")`.
6. **Wait for accept/reject**
   * `waitForEvent` on `app/video-image.accepted` / `app/video-image.rejected`.
   * On reject, mark workflow succeeded with `reviewOutcome: "rejected"`; no state changes.
7. **On accept**
   * Reload lecture to get the freshest state.
   * Replace the matching `videos[]` entry (same ID) with the new prompt/model/path.
   * Persist via `updateLectureContent`.
   * Publish `video-image-complete`.
8. **Mark run complete** and `publishStatus("Starting image regeneration complete")`.

Gotcha: The completion event is the authoritative signal that new metadata is saved. The client should not refresh before receiving it (see §7).

---

## 6. Cache Busting Strategy

### Helpers

* `buildAssetUrl({ url, updatedAt, previewToken })` (shared for every asset).
* `buildVideoAssetUrl(video, options?)` and `buildStartingImageUrl(video, options?)` wrap `buildAssetUrl`.
  * They reconstruct paths using `video.videoPath` or the legacy `startingImageUrl` fallback for pre-migration data.
  * `options.updatedAt` → `?v=<timestamp>`; `options.previewToken` → `?preview=<n>`.

### Usage in the editor

* **Committed view** – `buildStartingImageUrl(videoAsset, { updatedAt })`.
* **Preview modal** – `buildStartingImageUrl(previewVideoAsset, { previewToken: previewVersion })`.
* **Re-render triggers**:
  * `useAssetDraft` updates local state on acceptance (new prompt/model reflected immediately).
  * `refreshLecture()` runs after the completion event and carries a fresh `updatedAt`, ensuring the committed URL changes to include a new `?v=` query and invalidates caches throughout the app.

See `client/docs/asset-cache-busting.md` for the general rules shared across image, narration, music, and video starting images.

---

## 7. Known Gotchas & Resolutions

1. **Stale preview after acceptance**  
   * Root cause: `refreshLecture()` ran immediately upon acceptance, grabbing the old snapshot while the workflow was still persisting.  
   * Fix: Set `refreshOnAccept = false` in `useAssetGenerationFlow` for video assets and refresh only on the completion event (`refreshOnComplete = true`).

2. **Modal vs. main pane URLs**  
   * The modal must use the preview token, but the main pane should keep the committed `?v=` URL until the asset is actually accepted. Mixing these caused inconsistent caching.

3. **Legacy data without `videoPath`**  
   * `buildStartingImageUrl` falls back to the deprecated `startingImageUrl` field when `videoPath` is missing. This allows reading pre-migration records without dropping cache busting.

4. **Inngest function registration**  
   * Remember to add new functions to `client/src/app/api/inngest/route.ts`; otherwise preview events never fire and the UI appears frozen.

5. **Prompt/model defaults**  
   * Always resolve to sensible defaults (`projectSettings.video.imageModel`, `projectSettings.image.*`, `DEFAULT_IMAGE_MODEL`). Missing values lead to inconsistent prompts and visually jarring transitions.

---

## 8. File Reference Summary

* **Client**
  * `components/video-segment-editor.tsx`
  * `hooks/use-asset-generation-flow.ts`
  * `components/lecture-editor-provider.tsx`
  * `components/agent-progress.tsx`
  * `lib/video-assets.ts`
  * `docs/asset-cache-busting.md` (companion doc)
* **Server & Inngest**
  * `app/actions/regenerate-video-starting-image.ts`
  * `app/actions/accept-video-starting-image.ts`
  * `app/actions/reject-video-starting-image.ts`
  * `inngest/functions/regenerate-video-starting-image.ts`
  * `inngest/functions/generate-segment-videos.ts` (uses image model)
  * `app/api/inngest/route.ts`

Following this architecture keeps the video editing experience aligned with the other asset editors and avoids the cache-related regressions we previously encountered.
