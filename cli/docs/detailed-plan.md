# Detailed Plan

## Top Level Guidance
1) Don't write overly defensive code 
2) Do not leave hardcoded id names etc. remember everything is configured through TOML files \
3) Don't worry about backwards compatibility, we don't have a running system yet 
4) Don't leave obsolete code behind 
5) Always prefer fail fast with good error messages, don't hide errors under fallbacks.
6) Have decent code coverage

## Step 1 – Canonical Blueprint Schema & Expansion Foundations
- **Goal**: Teach the CLI/core blueprint loader to emit deterministic universal node IDs that match the TOML proposal, including index notation, `countInput`, artefact/input collapsing, and `sdkMapping` metadata. This is the prerequisite for removing ad-hoc ID guessing everywhere else.
- **Scope**:
  1. Update `cli/src/lib/blueprint-loader/toml-parser.ts` and related types to parse the new `[[inputs]]`, `[[artefacts]]`, `[[producers.sdkMapping]]`, and `[[subBlueprints]]` structures (as seen in `cli/blueprints/image-only.toml`).
  2. Rework `core/src/blueprint-loader` + `core/src/blueprints.ts` expansion so that nodes are instantiated using the `NodeType:Namespace.Name[indices]` format, fan-out is driven by `countInput`, and edges collapse Input⇄Artefact pairs per `cli/docs/TOML-based-config.md`.
  3. Emit a stable mapping object describing each producer’s inputs/outputs (including sdk mapping + canonical node IDs) so later phases can consume it.
- **Verification**:
  - Expand existing unit suites (`core/src/blueprint-loader/flattener.test.ts`, `core/src/blueprints.test.ts`) with cases covering multi-dimensional edges (`[i][j]`) and node-type collapsing.
  - Add parser tests to `cli/src/lib/blueprint-loader` (new file if needed) to ensure the TOML examples round-trip into the new structures.
  - Run `pnpm --filter tutopanda-core test` and `pnpm --filter tutopanda-cli test`.

## Step 2 – Planner, Runner, and CLI Context Wiring
- **Goal**: Propagate the canonical IDs and mapping data through planning/execution so every job carries the exact set of inputs it requires, eliminating alias heuristics.
- **Scope**:
  1. Update `core/src/planner.ts` to build `JobDescriptor` entries whose `inputs` are already canonical, plus attach an `inputBindings` map (or similar) and the producer’s `sdkMapping`/output metadata inside `job.context`.
  2. Simplify `core/src/runner.ts` and `core/src/artifact-resolver.ts` to consume the new metadata directly when merging resolved artefacts, removing alias inference and legacy ID juggling (while keeping backwards compatibility when reading older manifests/logs).
  3. Modify the CLI build path (`cli/src/lib/build.ts`) so provider contexts include the per-job binding info, ensuring the downstream providers have the data from Step 1.
- **Verification**:
  - Extend `core/src/planner.test.ts` and `core/src/runner.test.ts` to assert that jobs list only canonical IDs and that resolved inputs are merged solely via the provided bindings.
  - Add/adjust CLI planner tests (or integration snapshots under `cli/src/lib/planner.ts`) to confirm the stored plan JSON contains the new metadata.
  - Run `pnpm --filter tutopanda-core test` and `pnpm --filter tutopanda-cli test`.

## Step 3 – Provider Runtime & Producer Refactors
- **Goal**: Make every provider rely exclusively on the universal IDs + sdk mappings, eliminating bespoke prompt/text lookup logic.
- **Scope**:
  1. Extend `providers/src/sdk/runtime.ts` (or a new helper) so producer handlers receive utilities like `runtime.inputs.resolveByNodeId()` and `runtime.sdk.buildPayload(mapping)` backed by the metadata supplied in Step 2.
  2. Update the OpenAI LLM path (`providers/src/producers/llm/openai.ts` + `providers/src/sdk/openai/artefacts.ts`) to use the explicit artefact/output mappings rather than camelCase heuristics.
  3. Refactor Replicate producers (`providers/src/producers/image/replicate-text-to-image.ts`, `providers/src/producers/audio/replicate-audio.ts`, plus any shared SDK helpers) to build payloads directly from the new mapping, dropping planner-context-derived fallbacks.
- **Verification**:
  - Expand provider unit tests (e.g., `providers/src/producers/image/replicate-text-to-image.test.ts`) to assert that handlers fetch inputs via canonical IDs and emit SDK payloads that mirror the TOML `sdkMapping`.
  - Refresh integration tests under `providers/tests/integration` to cover the new behavior end-to-end (OpenAI JSON responses, Replicate audio/image jobs).
  - Run `pnpm --filter tutopanda-providers test` (and targeted `vitest run` commands per package if needed).

Each step produces a self-contained, testable milestone and hands the necessary metadata to the next phase, ensuring we can ship incrementally with confidence.
