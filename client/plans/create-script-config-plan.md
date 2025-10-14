## Plan: Enrich create-script prompt with project configuration

1. Audit existing configuration types and defaults to introduce constrained language options and prepare duration/segment helpers in `client/src/types/types.ts`.
2. Update the general configuration UI to show formatted duration labels and expose the new language select while keeping stored values unchanged.
3. Extend the Inngest `create-lecture-script` event payload to include general and narration settings fetched from project settings.
4. Refactor `client/src/prompts/create-script.ts` to build system/user prompts with template literals that incorporate duration, audience, language, and segment length instructions.
5. Verify cross-file imports and adjust any affected modules so the new configuration flows compile without regressions.
