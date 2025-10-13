# Cross-Asset Regeneration Plan

## Why We’re Changing Things
- **Stale in-memory state:** Editors maintain their own prompt/script/model drafts, but `LectureEditorProvider` only refreshes on timeline/image events. Accepted narration/music runs update the DB while the provider – and thus audio players/forms – keep serving the old asset until a hard reload.
- **Cache busting gaps:** Preview modals and players rely on `updatedAt` for cache busting. Without a provider refresh the timestamp stays unchanged, so “new” audio often plays the old file.
- **Preview data mismatch:** Inngest previews return the regenerated prompt/metadata, yet editors immediately reset to the provider’s stale snapshot after accept/reject, erasing user tweaks and showing outdated info.
- **Duplicated flow logic:** Visuals, narration, and music each reinvent the generate → review → accept/reject state machine, increasing bugs and inconsistencies.
- **Draft lifecycle ambiguity:** Rejecting a generation should not revert the user’s latest prompt edits; only leaving the clip should reset to the last committed version.

## Design Goals
1. **Single source of truth:** `LectureEditorProvider` remains the canonical store for accepted assets; editors derive read-only snapshots from it.
2. **Transient drafts:** Editors keep prompt/script/model edits locally until a run is accepted. Rejecting retains the draft; navigating away reverts to provider data.
3. **Realtime reconciliation:** Preview events instantly update the editor UI; completion events mutate provider state so the entire app sees fresh data without reloads.
4. **Shared flow, DRY implementation:** A single regeneration controller drives visuals, narration, and music to guarantee consistent UX and reduce duplication.
5. **Simple uni-directional flow:** Data moves provider → editor draft → regenerate workflow → provider update. No additional state libraries required.

## Proposed Architecture

### 1. Shared regeneration controller
- Implement `useAssetGenerationFlow` with configurable inputs:
  - Asset identifiers (clip + asset IDs), asset type (`visual`, `narration`, `music`).
  - Regenerate/accept/reject actions.
  - Preview payload extractor (e.g. pick `imageAsset`, `narrationAsset`).
- Internally manage `runId`, `preview`, `isGenerating`, `isReviewOpen`, `isDecisionPending`, `error`.
- Subscribe to Inngest messages via the global subscription, filtering on `runId` to capture preview, completion, and error states.
- Expose simple callbacks (`start`, `openReview`, `accept`, `reject`, `reset`) so editors stay thin.

### 2. Local draft helper
- Create `useAssetDraft` that:
  - Receives the provider snapshot for the active asset.
  - Exposes `[draft, setDraft, hasChanges, resetToProvider, applyPreview]`.
  - Tracks a “baseline” snapshot so rejecting keeps the current draft while switching clips resets to provider data.
  - `applyPreview` merges accepted preview data into both baseline and draft, ensuring UI reflects the new committed state immediately.

### 3. Provider enhancements
- Extend `LectureEditorProvider`’s subscription effect to handle `narration-complete` and `music-complete`, reusing the image refresh path.
- Add `applyAssetUpdate(type, assetId, data)` to optimistically inject accepted preview data before the server responds.
- Export `refreshLecture()` so editors can force a snapshot fetch immediately after accept instead of waiting for the completion event.
- Debounce refreshes to avoid hammering the server when multiple assets finish in quick succession.

### 4. Cache busting utility
- Introduce `buildAssetUrl({ baseUrl, updatedAt, previewToken })`:
  - Use a per-preview token (incremented by the regeneration hook) for modal/player URLs while reviewing.
  - Fall back to provider `updatedAt` once the asset commits.
- Apply the helper across image and audio consumers to avoid bespoke query-string logic.

### 5. Editor integration
- Refactor visuals, narration, and music editors to consume the shared hook and draft manager.
- Ensure UI strings remain asset-specific (e.g. “Generate Narration”) but behaviour is unified.
- Reject leaves the draft untouched; accept applies preview data, triggers provider update, and resets decision state.
- Remove agent-panel-driven preview modals; editors own their entire loop.

### 6. Optional: leverage lecture revisions
- Evaluate existing `lecture_revisions` infrastructure to see if accepted previews should append a revision entry. If practical, integrate the optimistic provider update with revision snapshots; otherwise leave as future work.

## Implementation Tasks
1. **Provider updates**
   - Handle narration/music completion events.
   - Implement `applyAssetUpdate` and `refreshLecture` with debounce.
2. **Shared helpers**
   - Build `useAssetGenerationFlow` and `useAssetDraft`.
   - Add the `buildAssetUrl` cache helper.
3. **Editor refactors**
   - Migrate visuals editor onto the new hooks (ensuring parity with the current flow).
   - Refactor narration and music editors to share the same architecture.
4. **Modal adjustments**
   - Align preview modals with the shared flow (explicit reject, decision pending).
5. **Verification**
   - Manual QA: generate → review → accept/reject for each asset, confirm drafts behave as expected.
   - Validate cache busting (preview token vs. committed timestamp).
   - Confirm no stale prompts/scripts/audio after accept without page reload.

## Open Questions
- Is there value in surfacing the working draft (unsaved edits) elsewhere in the UI so users can return to unfinished work?
No, this is out of scope.
