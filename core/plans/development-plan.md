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

## Milestone 5 – Runner Infrastructure (dry-run)
- **Core additions**
  - Implement `Runner.execute` + `Runner.executeJob` with in-memory job graph but stubbed `produce`.
  - Add `RunResult` container with `buildManifest()` placeholder (returns previous manifest for now).
- **CLI work**
  - New `pnpm --filter tutopanda-cli run build:prepare --movie <id>` that:
    - Reads latest plan.
    - Runs runner in dry-run mode (records intended jobs in `runs/<rev>-progress.json`).
    - Shows dependency layers and job counts.
- **Tests**
  - Core: ensure runner respects plan layering and concurrency guards even with mock `produce`.
  - CLI: confirm command generates progress file and logs layered output.

## Milestone 6 – ProduceFn Wiring & Asset Blob Writes
- **Core additions**
  - Define `BlobRef` + blob store helpers (content-addressed path under `blobs/`).
  - Update `Runner.execute` to call provided `produce`, append artefact events, and return manifest-builder input.
  - Implement `RunResult.buildManifest()` to fold latest artefact events into a new manifest.
- **CLI work**
  - Add configuration for provider shims (mock implementations for local dev).
  - Command `pnpm --filter tutopanda-cli run build:execute --movie <id>` executing plan end-to-end using mocks that emit sample artefacts (images/audio as text files).
- **Tests**
  - Core: unit tests covering blob dedupe + manifest update when new hash differs.
  - CLI: integration test verifying new manifest appears and `current.json` points to revision.

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
