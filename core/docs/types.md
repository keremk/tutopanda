# Configuration & Type Reference

This document describes the runtime/schema types that power the build planner and CLI tooling. All schemas live under `core/src/schema/` and are exported through `tutopanda-core`, so every package (CLI, server, tests) can rely on the same contract.

## Module overview

| Module | Purpose |
| ------ | ------- |
| `schema/input-values.ts` | Enumerates valid `InputSource` IDs and validates their payloads. Exports `InputId`, `InputValues`, and `InputValueSchema`. |
| `schema/config.ts` | Shapes storage + blueprint configuration, including the full build-plan config (`BuildPlanConfigSchema`). |
| `schema/index.ts` | Barrel that re-exports the schemas/types so consumers can `import { BuildPlanConfigSchema, InputValues } from 'tutopanda-core'`. |

## Build-plan configuration schema

```ts
import { z } from 'zod';
import {
  StorageLocationInputSchema,
  BlueprintConfigSchema,
  InputValuesSchema,
} from 'tutopanda-core';

export const BuildPlanConfigSchema = z.object({
  storage: StorageLocationInputSchema.optional(),
  blueprint: BlueprintConfigSchema,
  inputs: InputValuesSchema,
});

export type BuildPlanConfig = z.infer<typeof BuildPlanConfigSchema>;
```

A valid configuration file therefore looks like:

```json
{
  "storage": {
    "root": "/absolute/path/to/builds",
    "basePath": "builds"
  },
  "blueprint": {
    "segmentCount": 2,
    "imagesPerSegment": 1,
    "useVideo": false,
    "isImageToVideo": false
  },
  "inputs": {
    "InquiryPrompt": "Tell me a story",
    "Duration": 60,
    "SegmentNarrationInput": ["Line one", "Line two"],
    "UseVideo": false,
    "ImagesPerSegment": 1
  }
}
```

`BuildPlanConfigSchema.parse(raw)` returns the strongly-typed `BuildPlanConfig`. The CLI’s `build plan` command now uses this schema so misconfigured files surface a precise validation error.

### Blueprint configuration

- `segmentCount`: positive integer (required)
- `imagesPerSegment`: non-negative integer (required)
- `useVideo`: boolean OR an array of booleans (to support conditional expansion)
- `isImageToVideo`: boolean OR an array of booleans

### Storage location (optional)

- `root`: absolute filesystem path for the storage root
- `basePath`: directory prefix inside `root` (defaults to `builds` when omitted)

## Input payloads

`InputValuesSchema` accepts a partial record where each key is one of the blueprint `InputSource` IDs listed below. If a key is present its value must match the declared type; absent keys are simply ignored.

| Input ID | Type |
| -------- | ---- |
| `InquiryPrompt` | `string`
| `MovieDirectionPromptInput` | `string`
| `MusicPromptInput` | `string`
| `SegmentNarrationInput` | `string[]`
| `VoiceId` | `string`
| `Emotion` | `string`
| `Audience` | `string`
| `Language` | `string`
| `Duration` | `number` (positive)
| `ImagesPerSegment` | `number` (integer ≥ 0)
| `SegmentImagePromptInput` | `string[]`
| `ImageStyle` | `string`
| `Size` | `string`
| `AspectRatio` | `string`
| `UseVideo` | `boolean`
| `IsImageToVideo` | `boolean`
| `StartingImagePromptInput` | `string`
| `SegmentAnimations` | `Record<string, unknown>`
| `AssemblyStrategy` | `string`

Resulting TypeScript helpers:

```ts
import { InputValues, InputId } from 'tutopanda-core';

declare const inputs: InputValues;
const prompt: string | undefined = inputs.InquiryPrompt;
```

## CLI configuration (`tutopanda init`)

The CLI now owns its own config file at `~/.tutopanda/config.json` (or a path you supply). Running `pnpm --filter tutopanda-cli run init [--storagePath <dir>]` writes:

```json
{
  "storage": {
    "root": "/home/<user>/.tutopanda/builds"
  }
}
```

`build plan` resolves storage roots in the following precedence order:

1. CLI flags (`--root`, `--base-path`)
2. Configuration file (`storage.root`, `storage.basePath`)
3. Defaults (`~/.tutopanda/builds`, `builds`)

## Validation workflow

1. CLI (or server) parses the user-provided JSON with `BuildPlanConfigSchema.parse`. Any validation failure throws a `ZodError`; the CLI surfaces the message to the user.
2. Inputs are converted to hashed `InputEvent`s via the typed `InputValues` map.
3. Planner consumes the resulting manifest + event log and emits an execution plan.

The schema modules are covered by unit tests (`core/src/schema/input-values.test.ts`, `core/src/schema/config.test.ts`) to ensure new blueprint inputs or config tweaks don’t drift silently.
