# Image Style Prompt Separation Plan

## Objectives
- Preserve the LLM-generated (and optionally user-edited) prompt exactly as authored, while letting users pick from curated image styles like Ghibli or Pixar.
- Append the style-specific guidance to the base prompt only when dispatching a generation request, keeping model parameters such as size and aspect ratio independent.
- Provide richer style metadata so both the UI and prompt builder can display descriptions and reuse the same snippets, with string interpolation used throughout.
- Store and persist the base prompt and the chosen style as distinct pieces of data so they can evolve independently.

## Understanding the Current Flow
1. **Prompt generation (Step 1 already exists)**  
   - We ask the LLM for one or more base prompts using `create-image-prompt.ts`, driven by the segment narrative. The output becomes `imageAsset.prompt`, which the user can edit in the visuals editor.
2. **Prompt augmentation for generation (Step 2 we must refine)**  
   - Today the visuals editor sends a single combined prompt string to the image generator. We need to restructure this so the final payload is created via `basePrompt + styleSnippet` during generate/regenerate actions, leaving the user-editable base prompt untouched in the UI and database.

## Implementation Steps
1. **Map Prompt + Style Persistence**
   - Inspect how `imageAsset.prompt` and project-level config are serialized to ensure we can persist the user's base prompt separately from the enumerated style. Confirm the server only expects `prompt`, `model`, and other parameters so we can add an explicit `style` field in the data layer if needed.
2. **Create Shared Style Metadata Source**
   - Introduce a single source of truth (e.g., `client/src/lib/image-styles.ts`) keyed by `imageStyleValues` that captures display name, detailed description, and the style prompt snippet (e.g., `Use Ghibli style emphasizing ...`).  
   - Export helpers for looking up metadata and for building the style interpolation fragment so both UI and prompt builders stay consistent.
3. **Refactor `create-image-prompt.ts`**
   - This should contain two separate prompt builders: 
   - First (`buildImagePromptUserMessage`) is building a prompt for the LLM to generate one of more image prompts which takes in the narrative plus number of images needed (as it currently does). No changes necessary here accept using string literals instead of `Array.join`. We should rename this to `buildPromptForImageGeneration`
   - The second (`buildImageGenerationPrompts`) is similar to `create-script.ts` by accepting the segment plus the image configuration data that actually impacts prompt wording (e.g., desired style) while explicitly excluding size and aspect ratio, and return the builder prompt using template literals rather than `Array.join`. This prompt is going to be served to the image generator to generate the final image. This will be used in `generateLectureImages` but be careful and figure out how these flow properly. 
4. **Update Visuals Editor State & UI**
   - Extend the editor draft state to hold `basePrompt` and `style` separately; keep a derived value for the combined prompt that is only used when dispatching generation actions.  
   - Add a style selector near the model select, pulling label/description from the shared metadata. Show the description inline so users know what each style implies.  
   - When a new asset loads, populate `basePrompt` from `imageAsset.prompt` and `style` from saved asset data or project default. Make sure editing the prompt field never injects the style snippet.
5. **Adjust Generation Actions**
   - Update places like `regenerateImageAction` (and any initial generation triggers) to call the augmentation helper before sending the payload to the backend. Keep other parameters—size, aspect ratio, model—passed separately as they are today.  
   - Ensure we persist any style selection changes back to storage so future sessions load with the same configuration.
6. **Downstream Display & Review**
   - Double-check components such as `ImagePreviewModal` to either show the combined prompt or present base prompt + style context clearly. Decide whether to store the combined prompt only in transient preview data or display it reconstructed on the fly.
7. **Validation**
   - Run `pnpm --filter tutopanda-client type-check` to verify type safety.  
   - Manually test that editing the base prompt or switching styles updates the generated output while leaving the saved base prompt untouched. Confirm Step 1 (LLM generation) still behaves identically and Step 2 only augments the prompt at dispatch time.

## Risks & Follow-Ups
- Historical assets may not have style metadata; we need sensible fallbacks (e.g., defaulting to project settings) and maybe a migration path if we start persisting style per asset on the server.
NO WORRIES HERE, this is in active development, no real users, I just need to reset the database
- Other workflows might assume `imageAsset.prompt` already includes style guidance, so we must audit for regressions and potentially update those consumers to call the augmentation helper.
RESEARCH THIS CAREFULLY
