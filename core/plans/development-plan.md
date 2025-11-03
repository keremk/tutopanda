# Development Plan: Manifest-Oriented Build System

This roadmap breaks the storage + execution stack into milestones that each deliver a working CLI flow, core APIs, and unit/spec coverage. We start from the current state (blueprint definitions + expansion logic in place) and iterate toward full revision-aware builds with manifests and event logs.

## Milestone 0 – Baseline Verification (existing)
- **Goal**: Lock in the blueprint expansion CLI so later milestones can depend on it.
- **CLI touchpoint**: `pnpm --filter tutopanda-cli run plan --movie <id>` (already produces expanded graph JSON).
- **Tests**: Ensure blueprint expansion is covered with snapshot/unit tests (Vitest) to catch regression as storage evolves.

## Milestone 1 – Storage Context & Configuration Wiring
- **Core additions**
  - Implement `StorageConfig` type + `createStorageContext` (FlyStorage-backed path resolver).
  - Add lightweight `Clock` and `Logger` interfaces.
  - Introduce `planStore.save/load` scaffolding (writes to `runs/<rev>-plan.json` using FlyStorage).
- **CLI work**
  - New command `pnpm --filter tutopanda-cli run storage:init --movie <id>` that bootstraps the folder structure (`manifests/`, `events/`, `runs/`, `blobs/`, `current.json` stub).
- **Tests**
  - Core: unit tests for path resolution + plan store using in-memory FlyStorage plugin.
  - CLI: integration test (with tmp dir) asserting scaffolded layout and idempotency.

## Milestone 2 – Event Log Layer
- **Core additions**
  - Implement `EventLog` helpers (`streamInputs`, `streamArtefacts`, appenders).
  - Define `InputEvent` / `ArtefactEvent` hashing utilities.
  - Ensure append operations are atomic (temp file + rename or FlyStorage transaction).
- **CLI work**
  - Extend `storage:init` to seed empty `events/inputs.log` + `events/artefacts.log`.
  - Add `pnpm --filter tutopanda-cli run events:append --movie <id> --type input|artifact --file sample.json` for smoke testing.
- **Tests**
  - Core: Vitest covering append + stream iteration (including tailing only new entries).
  - CLI: smoke test verifying command appends line and events can be parsed by core helper.

## Milestone 3 – Manifest Skeleton & Current Pointer
- **Core additions**
  - Implement `Manifest` type, validation, and `ManifestService.loadCurrent/saveManifest`.
  - Add `manifest-from-events` builder stub returning aggregated hashes (without full timeline yet).
  - Ensure `current.json` pointer update is atomic.
  - Introduce `createInputHasher` / `createArtefactHasher` utilities that accept raw payloads (strings, numbers, objects) and emit canonical hashes + normalized payload digests so tests can exercise real config data.
- **CLI work**
  - Introduce `pnpm --filter tutopanda-cli run manifest:show --movie <id>` that prints the current manifest (or explains how to initialize).
  - Update CLI edit/append flows to call the new hashing helpers directly so captured events reflect actual user input rather than pre-baked digests.
- **Tests**
  - Core: round-trip tests for `saveManifest` + `loadCurrent`, ensuring pointer updates survive simulated crashes, plus unit coverage for the hashing helpers across payload types.
  - CLI: fixture manifest to confirm command output and error messaging for uninitialized movies, and hashing tests feeding representative user input through the CLI command surface.

## Milestone 4 – Planner Integration
- **Core additions**
  - Implement `Planner.computePlan` using manifest + event log dirty detection (per design doc).
  - Provide planner API for injecting blueprint + pending edits.
- **CLI work**
  - Replace existing plan command with `build plan` that:
    1. Loads current manifest + events via new services.
    2. Calls `Planner`.
    3. Writes resulting plan to `runs/<rev>-plan.json`.
  - Print summary (revision id, dirty producers count).
- **Tests**
  - Core: deterministic planner tests using fixture manifests/events, asserting dirty propagation.
  - CLI: integration test verifying plan file presence and summary output.

## Milestone 4.5 – CLI Workflow & Prompt Editing
- **Core additions**
  - Expand config schemas with friendly enums (styles, audiences, language codes) and helpers for materialising prompt/timeline files that preserve formatting.
  - Provide utilities for hashing per-segment prompt files and timeline edits so planner dirty detection sees file-level changes instead of monolithic hashes.
- **CLI work**
  - Implement new command surface per `cli/docs/cli-interface.md`:
    - `tutopanda init` scaffolding the CLI config (defaulting to `~/.tutopanda`, storing defaults in JSON).
    - `tutopanda query "<prompt>"` loading defaults, applying shortcut flags (`--style`, `--voice`, etc.), invoking planner/runner, and returning a movieId.
    - `tutopanda inspect` exporting prompts/timeline into user-friendly TOML/JSON while keeping the underlying prompt files on disk as plain text.
    - `tutopanda edit` re-importing edited TOML inputs, updating per-segment prompt files, hashing them individually, and requesting regeneration.
  - Retire legacy `build plan` / `events append` commands in favour of the high-level workflow.
- **Tests**
  - CLI: thorough Vitest coverage for init/query/edit flows, including validation errors, config precedence, and hashing of edited prompts.
  - Core: schema tests ensuring enums/validation stay in sync with blueprint inputs and prompt file hashes map cleanly to event-log artefact IDs.

## Milestone 5 – Runner Infrastructure (dry-run)
- **Core additions**
  - Implement `Runner.execute` + `Runner.executeJob` with in-memory job graph but stubbed `produce`.
  - Add `RunResult` container with `buildManifest()` placeholder (returns previous manifest for now).
- **CLI work**
  - Augment the query/edit commands to optionally run in dry-run mode, surfacing the dry-run report inline (replaces prior `build:prepare` utility).
- **Tests**
  - Core: ensure runner respects plan layering and concurrency guards even with mock `produce`.
  - CLI: confirm command generates progress file and logs layered output.

## Milestone 5.5 – Provider Registry with Mock Producers
- **Providers package**
  - Implement the registry described in `providers/docs/provider-architecture.md`, loading mappings and exposing `resolve`/`warmStart`.
  - Populate `mappings.ts` with mock-only handlers for every `ProducerKind`, returning deterministic artefacts suitable for unit and integration tests.
  - Add shared fixtures/utilities (`secretResolver`, logger adapters) and document the usage in the providers README.
- **Core updates**
  - Define a producer catalog contract and require callers to inject provider/model metadata when expanding blueprints (no more hard-coded defaults inside core).
  - Update the runner’s `produce` stub to call into the providers registry (mock mode) and surface structured `ProducerResult` data.
- **CLI work**
  - Add a `--dryrun` option to `tutopanda query` / `edit` that executes the full plan against the mock providers, persists mock artefacts, and prints a summary so new producers/blueprints can be validated manually.
- **Tests**
  - Providers: Vitest coverage for registry resolution, per-kind mock producers, and secret resolver defaults.
  - Core/CLI: integration test showing a full plan + run uses the registry and produces mock artefacts end-to-end.

## Milestone 6 – ProduceFn Wiring & Asset Blob Writes
- **Core additions**
  - Define `BlobRef` + blob store helpers (content-addressed path under `blobs/`).
  - Update `Runner.execute` to work with the registry-backed mock producers, append artefact events, and return manifest-builder input.
  - Implement `RunResult.buildManifest()` to fold latest artefact events into a new manifest.
- **CLI work**
  - Extend `query`/`edit` to execute full builds, writing manifests and reporting previews (supersedes `build:execute`), still defaulting to mock providers.
- **Tests**
  - Core: unit tests covering blob dedupe + manifest update when new hash differs.
  - CLI: integration test verifying new manifest appears and `current.json` points to revision using mock artefacts.

## Milestone 6.5 – Registry Live Mode & Config Bridge
- **Providers package**
  - Extend the registry with `resolveMany`, warm-start orchestration, and environment-aware handler selection (`mock` vs `live`).
  - Define provider descriptor/builders that accept parsed configuration payloads (`providerConfig`, raw attachments) without imposing semantics.
  - Document the enriched `ProviderJobContext` contract and update mock factories to satisfy the new signature.
- Replace the current `providers/src/catalog.ts` with a mapping of `(provider, model, environment)` → handler factory, keeping ownership of concrete implementations inside the providers package.
  - Have the CLI supply the producer→provider catalog when planning; providers only map execution handlers by `(provider, model, environment)`.
- **Core updates**
  - Teach the runner/`createProviderProduce` wrapper to cache resolved bindings, pass through parsed configs, and record provider metadata on artefact events.
  - Ensure job diagnostics capture provider mode (`mock`/`live`) and selected model for later manifest diffs.
- **CLI work**
  - Adopt the new settings schema (flat `general` section + `producers` array), scaffolding default JSON/TOML files during `tutopanda init`.
  - Parse per-provider config files during `query`/`edit`, populate `providerConfig`/`rawAttachments`, and surface validation errors before execution.
  - Persist provider selections alongside each movie (`providers.json`) and surface configuration summaries in dry-run output so users can confirm provider variants prior to live execution.
- **Tests**
  - Providers: Vitest coverage for `resolveMany`, warm-start scheduling, and error propagation when secrets/config are missing.
  - Core/CLI: integration test that runs a dry-run using the richer context payload and asserts artefact diagnostics include provider metadata.

## Milestone 6.6 – OpenAI Responses Handler
- **Core updates**
  - Add a reusable JSON-path helper for mapping structured model outputs to artefact fields.
  - Persist provider diagnostics (response identifiers, usage metrics) with artefact events so manifests capture OpenAI metadata.
- **Providers package**
  - Implement the OpenAI LLM handler on top of the Vercel AI SDK 6 Responses API: template prompts, forward JSON-schema response formats, parse payloads, and emit artefacts with detailed diagnostics.
  - Honour workspace `secretResolver` for `OPENAI_API_KEY`, supporting warm-start validation without network calls.
- **CLI work**
  - Thread resolved CLI inputs into provider invocations (`context.extras.resolvedInputs`) so handlers can substitute variables without duplicating parsing logic.
  - Extend the provider registry plumbing (`createProviderProduce`) to cache handlers, attach resolved inputs, and surface provider logs.
  - Introduce `tutopanda providers:list` to summarise configured variants and report readiness (handler present, secrets available).
- **Tests**
  - Providers: unit coverage for the OpenAI handler spanning successful JSON schema mapping, missing field handling, and secret errors.
  - CLI: regression covering `runProvidersList` and ensuring OpenAI-backed `query --dryrun` exercises the new produce path.

## Milestone 6.7 – Replicate & Audio/Video Providers
- **Providers package**
  - Implement Replicate handlers for image/video/music/audio producers, including job polling, cancellation, and blob download support.
  - Add ElevenLabs (or alternative TTS) handler with configuration bridge for voice/emotion settings and result normalisation.
  - Update registry mappings so each producer lists primary + fallback live handlers by environment (`local` vs `cloud`).
- **Core updates**
  - Ensure blob persistence paths handle streamed downloads from Replicate and audio providers without blocking the event loop.
  - Record provider-specific diagnostics (prediction IDs, voice IDs, etc.) alongside artefact events for later debugging.
- **CLI work**
  - Surface provider selection flags/overrides (per producer) and cost warnings when switching from mock to live execution.
  - Document required environment variables and add CLI preflight checks that block live runs when secrets are missing or quotas are exhausted.
- **Tests**
  - Providers: mocked HTTP integration tests for Replicate/ELEVENLabs flows (create/poll/cancel) plus fixture-based blob persistence tests.
  - Core/CLI: mixed-mode regression test (some OpenAI, some Replicate mocked) verifying manifests include provider metadata and blobs land on disk.

## Milestone 7 – End-to-End Regeneration Loop
- **Core additions**
  - Finalize manifest builder (timeline assembly + changed artefact list).
  - Add utility for diffing manifests (used later in CLI).
- **CLI work**
  - Single `build run` command orchestrating:
    1. Planner compute.
    2. Runner execute with real or stub providers.
    3. Manifest commit.
    4. Optional `--diff` flag to show changed artefacts.
  - Provide `--revision` flag to view past manifests.
- **Tests**
  - End-to-end CLI test using mocks verifying asset files, events, manifests, and pointer update.
  - Core: manifest diff unit tests.

## Milestone 8 – Regression & Observability Enhancements
- **Core additions**
  - Metrics & logging hooks (cost aggregation, job durations).
  - Checkpoint file helpers (optional restart support).
- **CLI work**
  - `build status` command summarizing latest revision, failed jobs, asset counts.
- **Tests**
  - Core: ensure metrics calculations accurate via fixture events.
  - CLI: ensure status command surfaces key numbers/manifests.

## Milestone 9 – Vercel Workflow Adapter Spike
- **Goal**: Prove the core APIs can power server steps.
- **Server package work**
  - Create workflow step modules mirroring the pseudo-code: load manifest, compute plan, execute layer, save manifest.
  - Minimal workflow orchestrator calling the steps sequentially with `Promise.all` concurrency per layer.
- **Tests**
  - Unit tests for each step using mocked provider calls (Vitest in server package).
  - Optional workflow integration test under `pnpm --filter tutopanda-server test`.

## Milestone 10 – Harden & Document
- **Docs**
  - Update `core/docs/generation-graph.md` and CLI README with new commands + storage layout.
  - Add runbooks for local QA (e.g., “Run `pnpm --filter tutopanda-cli run build run --movie demo`”).
- **Tests**
  - Ensure `pnpm --recursive run lint` / `test` / `type-check` cover new modules.
- **Release gating**
  - Manual QA script verifying CLI run, manifest diff, and event logs for sample movie.

Each milestone leaves the repo in a runnable state, adds incremental tests, and surfaces new CLI ergonomics so stakeholders can validate progress early.
