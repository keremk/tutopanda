# Video Segment Regeneration

This document complements `video-starting-image-regeneration.md` and captures the specifics of regenerating a video segment via the editor’s **Regenerate Video** button.

---

## Flow Overview

```
Client (video-segment-editor) ──┐
                               │ regenerateVideoSegmentAction
                               ▼
                       Inngest (app/regenerate-video-segment)
                               │
               generate video using existing starting image + overrides
                               │
             publish preview → user review/accept/reject in modal
                               │
                 update lecture.videos[] on acceptance (same ID)
                               │
                    publish completion → client refreshes cache
```

The regeneration hook mirrors the behaviour of the starting-image flow:

| Layer            | Responsibility                                                                          |
|------------------|------------------------------------------------------------------------------------------|
| **Editor UI**    | Collects updated movie directions/model, shows committed asset, opens preview modal.     |
| **Server action**| Validates ownership, resolves project defaults, fires the Inngest event with overrides.  |
| **Inngest fn**   | Loads the stored starting image, regenerates the video, publishes preview/completion.    |
| **Lecture store**| Optimistically updates the draft, then refreshes from the server on `video-complete`.    |

---

## Key Implementation Details & Gotchas

1. **Starting image is required**  
   - The workflow reuses the existing `startingImageId`; if the file is missing (or the asset never had one) the run publishes a human-friendly error telling users to regenerate the starting image first.  
   - We intentionally do not auto-generate a placeholder to avoid masking data issues.

2. **Cache busting**  
   - The committed player always renders `buildVideoAssetUrl(videoAsset, { updatedAt })`.  
   - The preview modal uses `buildVideoAssetUrl(previewAsset, { previewToken })`, ensuring modal-only busting without flickering the main canvas.

3. **Optimistic updates**  
   - `useAssetGenerationFlow` writes preview metadata (movie directions/model/path) into the in-memory draft on accept, but defers a full refresh until `video-complete`.
   - Accepted previews keep the same asset ID so existing timeline clips continue to reference the regenerated video.

4. **Configuration precedence**  
   - Effective settings resolve in this order: editor overrides → project video defaults → existing asset values → hard defaults (`DEFAULT_VIDEO_MODEL`, etc.).
   - Duration/resolution fall back to project settings; lack of overrides keeps behaviour compatible with batch generation.

5. **Preview modal UX**  
   - The modal keeps all accept/reject controls; the main viewer never swaps to the preview asset to avoid the stale-cache flicker described in the starting-image doc.

---

## Manual QA Checklist

1. **Happy path** – Edit movie directions, regenerate, review in the modal, accept, confirm committed player refreshes only after completion.  
2. **Reject flow** – Reject the regenerated video; the draft should keep the edited directions, and the committed player remains unchanged.  
3. **Missing starting image** – Temporarily remove the stored starting image file (or test with a legacy asset) and confirm the UI surfaces “Regenerate the starting image first.”  
4. **Cache validation** – Capture the video URL before/after acceptance and ensure the committed query string switches from `?preview=` to `?v=` after completion.  
5. **Agent progress** – Verify the regenerate run shows preview + completion updates in `AgentProgress`.

Refer back to `video-starting-image-regeneration.md` for shared architecture and cache-busting guidelines.
