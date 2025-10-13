# Visuals Editor Generate Flow Refresh

## Goal
- Move the "Generate" button UX to a self-contained flow inside `visuals-editor.tsx`.
- Keep `AgentProgress` focused on progress messaging only.
- Ensure previewed images stay client-side until the user explicitly accepts them.

## Tasks
1. **Map current image regeneration flow**
   - Trace `visuals-editor`, `agent-progress`, `agent-panel`, and the Inngest `regenerate-single-image` function.
   - Confirm how preview payloads arrive and how accepted assets update lecture content.
2. **Redesign client UX around the generate button**
   - Add loading/disabled state while generation runs.
   - Store the generated preview in component state and switch the button label to `Review` once assets arrive.
   - Open the existing `ImagePreviewModal` on review clicks so accept/reject happen inside the modal while the image remains in memory.
   - On accept, call the existing accept action and refresh the preview pane with cache busting; on reject, fire the human-in-loop cancel event. Dismiss the modal.
3. **Decouple AgentProgress from image review controls**
   - Remove the image preview/accept buttons and keep narration/music flows intact for now, we will do them in the later stage.
   - Ensure progress messages still surface during generation and during accept/reject acknowledgement.
4. **Wire new human-in-loop events**
   - Introduce a reject/cancel action that notifies Inngest.
   - Update `regenerate-single-image` (and any listeners) to resolve cleanly on reject and send the appropriate status messages.
5. **Validation**
   - Smoke-test the new flow locally (generate → preview → accept/reject).
   - Run `pnpm --filter tutopanda-client type-check` and `pnpm --filter tutopanda-client lint`.

## Open Questions
- Should the in-memory preview be stored per clip or globally in the editor context for reuse across navigations?
- Do we need additional messaging in the agent panel when a user rejects an image?
