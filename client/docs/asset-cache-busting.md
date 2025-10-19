# Asset Cache Busting

Our editors assume asset files (images, audio, video) live at deterministic paths inside `/api/storage/<user>/<project>/<lecture>/<category>/<id>.<ext>`. Because we regenerate assets in place (same IDs/paths), every consumer must append cache-busting query params whenever it renders a URL.

## Building URLs

* `lib/asset-url.ts#buildAssetUrl` is the single helper for appending query parameters.  
  * `updatedAt` (a `Date`) becomes `?v=<timestamp>` and should reflect the last time the asset was accepted/saved.  
  * `previewToken` (a number) becomes `?preview=<token>` and is used for transient previews that should always bypass the browser cache.
* `lib/video-assets.ts#buildVideoAssetUrl` / `buildStartingImageUrl` wrap `buildAssetUrl` for video media. Images and audio can call `buildAssetUrl` directly after translating the relative storage path to `/api/storage/...`.

## Lifecycle in editors

1. **Committed assets** use `buildAssetUrl({ url, updatedAt })`.  
   * Each editor calls `applyAssetUpdate(...)` in `lecture-editor-provider.tsx`, which updates the local draft and bumps `updatedAt = new Date()`.  
   * When the lecture refetches from the API, the server-side `updatedAt` has also moved forward.
2. **Previews** use `buildAssetUrl({ url, previewToken })`.  
   * `useAssetGenerationFlow` increments `previewVersion` every time a preview arrives or the flow resets.  
   * Editors pass that `previewVersion` as the `previewToken` to guarantee unique URLs per preview iteration.
3. **Displayed values**
   * Primary content panes render the committed URL (`?v=...`).  
   * Review modals render the preview URL (`?preview=...`).  
   * If no preview is active, fall back to the committed URL.

## Adding a new asset type

1. Ensure the generator (Inngest function) persists a deterministic storage path (or enough metadata to reconstruct one) and returns the same identifier for previews.
2. Provide a helper that maps your asset shape to a `/api/storage/...` URL and calls `buildAssetUrl`.
3. In the editor:
   * Use `useAssetGenerationFlow` with a unique `assetType` so previews, accept/reject, and refresh logic remain consistent.
   * Keep user edits in a `useAssetDraft` hook; only call `applyPreview` / `applyAssetUpdate` once a preview is accepted.
   * Derive two URLs: one for committed content (`updatedAt`) and one for preview (`previewToken`).
4. Update `AgentProgress` (and any other status UI) to surface the new preview/complete messages published by your Inngest workflow.

Following these conventions keeps every asset in sync with our cache-busted URL strategy and prevents stale media from lingering in the UI.
