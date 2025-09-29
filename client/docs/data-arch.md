# Tutopanda Data Architecture

## Purpose & Goals
- Ensure every lecture can be edited safely by the browser and by long-running Inngest workflows without losing work.
- Provide predictable, debounced persistence so the UI never asks for an explicit "save" while still limiting database churn.
- Keep the stack lean: reuse Next.js server components and server actions for data access, avoid extra client-side data libraries, and rely on Drizzle + Neon as the source of truth.
- Preserve a clear audit trail so we can inspect or roll back lecture mutations when the product grows.

## System Overview
- **Frontend (Next.js 15 app)**: Server components fetch the latest lecture snapshot, then hand it to a client-side editor context that holds in-memory edits, debounces changes, and triggers auto-save actions.
- **Server actions / data layer**: A thin service layer in `client/src/data` wraps Drizzle queries. Server actions call these services to read and write, so the same logic serves RSCs, client actions, and Inngest functions.
- **Inngest workflows**: Background jobs (e.g. script generation, timeline synthesis) call the same data services to append revisions and update lecture snapshots, emitting progress events so the browser can refresh.
- **Postgres (Neon) via Drizzle**: Stores the authoritative row for each lecture plus append-only revision history and workflow run metadata.

## Type Boundaries
- **Database layer types** (`client/src/db/types.ts`): mirror Drizzle table shapes and column primitives (including `jsonb`) so migrations and persistence stay strongly typed. These types are never consumed outside the data layer.
- **Application layer types** (`client/src/types/types.ts`): compose Zod-validated domain objects (`lectureContentSchema`, timeline structures, workflow payloads) that the UI, server actions, and Inngest functions rely on. These express business rules (required fields, defaults) independently of storage.
- **Mapping contracts**: each data-layer API accepts/returns application types and converts to/from the persistence types internally. Parsing happens at the boundary (Zod → DB) and serialization happens on the way out (DB → Zod). This prevents leaking raw `jsonb` or nullable columns into the app and centralises shape changes.
- **Source of truth**: Zod schemas remain the canonical definition for application types; database types derive from Drizzle. Tests in the data layer should cover these transformations so a schema drift is caught early.
- **Planned refactor**: consolidate existing domain types from `schema.ts` and Inngest modules into `client/src/types/types.ts`, and ensure new APIs never expose Drizzle-generated types. Update existing services to use the new split progressively.

## Domain Model
### Existing Tables
- `projects` – already holds project ownership and name.
- `video_lectures` – remains the canonical current state for a lecture. Fields keep their JSON payloads (`script`, `images`, `narration`, `music`, `effects`, `timeline`). Add two columns:
  - `revision` (integer, default 0) – monotonically increasing version number for optimistic concurrency.
  - `updated_at` (timestamp with time zone, default `now()`) – used for change detection and UI freshness.

### New Supporting Tables
- `lecture_revisions`
  - `id` serial primary key.
  - `lecture_id` references `video_lectures(id)` with cascade delete.
  - `revision` integer – matches the value written into `video_lectures.revision` for that snapshot.
  - `data` jsonb – full lecture payload (script, timeline, media references).
  - `created_by` text – user id when the browser saved, or system id when Inngest saved.
  - `source` text – enum-like (`'app' | 'workflow' | 'system'`).
  - `run_id` text – optional Inngest run correlation.
  - `created_at` timestamptz default `now()`.
- `workflow_runs`
  - `run_id` primary key (text) – the UUID issued when a workflow starts.
  - `lecture_id` references `video_lectures(id)`.
  - `user_id` text – owner of the job.
  - `status` text – e.g. `queued`, `running`, `failed`, `succeeded`.
  - `current_step` integer and `total_steps` integer – drive progress UIs.
  - `context` jsonb – optional payload for debugging or replay.
  - `updated_at` timestamptz default `now()` – updated on every status change.

### Timeline JSON Shape
- The `timeline` column stays as jsonb but should follow a documented structure (store-friendly keys, durations, asset references). Keep a companion TypeScript type in `client/src/db/types.ts` so both the UI and workflows agree on the schema.
- Mock timeline data in `client/src/components/timeline-*` will be replaced with this typed payload once the persistence layer is wired up.

## Data Flow Scenarios
### 1. Creating a project + lecture
1. User submits the creation form (`createProjectWithLectureAction`).
2. The action runs inside a transaction:
   - Inserts the project.
   - Inserts the lecture placeholder row (`video_lectures`) with empty JSON payloads (null) and `revision = 0`.
   - Logs a `workflow_runs` entry with `status = 'queued'` and emits the Inngest event containing `runId`.
3. After commit, the action returns `{ projectId, lectureId, runId }` and revalidates relevant routes.
4. The client redirects to `/edit/[lectureId]` and RSC fetches the fresh data.

### 2. Loading the edit page
1. Server component `EditLecturePage` calls a new `getLectureWithTimeline(lectureId, userId)` helper.
2. The helper joins `video_lectures` with the owning project to enforce access control, returning the latest snapshot plus `revision` and `updated_at`.
3. The server component renders the page, passing the snapshot to a client-side provider (`<LectureEditorProvider>`).
4. The client provider hydrates and populates its local editor store. No additional client fetch is required because RSC supplied the data.

### 3. Client editing + auto-save loop
1. Timeline UI components read/write data via the provider (React context + reducer). No external state libraries are required.
2. Mutations enqueue into an in-memory `changeset` buffer that keeps track of dirty fields (e.g. `timeline`, `script`).
3. A debounced effect (e.g. 2–3 seconds after the last change) triggers the `saveLectureDraft` server action with:
   - `lectureId`
   - `payload` (only changed sections or the full snapshot)
   - `baseRevision` (the revision that the editor last fetched)
4. The server action validates the payload, then runs a transaction:
   - Reads the current `video_lectures.revision`.
   - If it matches `baseRevision`, increments the revision (`revision + 1`), updates the JSON columns and `updated_at`, inserts a row into `lecture_revisions`, and returns the new revision.
   - If the stored revision is greater than `baseRevision`, the action returns a `conflict` flag plus the latest snapshot so the client can reconcile (drop local changes or merge manually later).
5. The client provider updates its local `revision` and clears the pending changes. If a conflict occurs, the UI shows a refresh banner letting the user reload or attempt a manual merge.
6. Because the save happens through a server action, no extra dependency (e.g. TanStack Query) is necessary. The action response provides all data required to keep the editor in sync.

### 4. Background workflows writing results
1. Inngest steps (script generation, timeline synthesis, image prompts) call shared data helpers, e.g. `upsertLectureSnapshot({ lectureId, payload, actor: 'workflow', runId })`.
2. The helper increments the lecture revision inside a transaction, inserts into `lecture_revisions`, and updates `video_lectures`.
3. Each step also updates the `workflow_runs` row (`status`, `current_step`) and publishes a progress event through your existing realtime mechanism.
4. When the browser receives the progress event indicating completion or new content, the client provider triggers a lightweight `fetchLectureSnapshot` server action to merge the new authoritative state. This pull keeps the editor consistent even if the tab was idle.
5. Because workflows write directly to the database, they continue functioning even if the user closed the browser.

### 5. Handling user ⇄ workflow overlap
- Optimistic concurrency via `revision` ensures that simultaneous saves do not overwrite each other.
- Conflict response includes the authoritative snapshot so the UI can either overwrite with a force-save (unsafe) or reapply local edits.
- Logging each mutation in `lecture_revisions` preserves the losing writer’s payload for future diffing or manual recovery.

## Client State Strategy
- **Server components + server actions** already cover read/write needs. The browser hydrates with complete data from the RSC render, so there’s no need for TanStack Query’s caching layer at this stage.
- **Editor provider**: create a dedicated React context hook (e.g. `useLectureEditor`) that stores:
  - Current lecture snapshot.
  - Draft changes and dirty flags.
  - Debounced save controller and status (`saving`, `idle`, `error`).
  - Conflict metadata returned by the server action.
- Derived UI-only state (playhead position, selection) lives alongside the provider but is never persisted.
- If future features demand cache invalidation across many pages, TanStack Query can be introduced, but keeping it out now aligns with the “no unnecessary dependencies” goal.

## Concurrency & Consistency
- **Optimistic locking**: `revision` acts as the guard. All writes must include the last known revision; mismatches trigger conflict handling.
- **Idempotent workflows**: Inngest steps include `runId` and update the same row idempotently. If a function retries, `workflow_runs` detects the duplicate and short-circuits the write.
- **Audit trail**: `lecture_revisions` keeps every snapshot with actor metadata so you can inspect history or run analytics later.
- **Revalidation**: After successful saves (client or workflow), call `revalidatePath` for affected routes (`/edit/[lectureId]`, project list) so SSR views stay fresh.

## Operational Considerations & Next Steps
1. **Migrations**: Add `revision` and `updated_at` to `video_lectures`, create the new tables, and backfill existing rows with `revision = 0`.
2. **Type definitions**: Move Zod/domain types into `client/src/types/types.ts`, keep Drizzle mirrors in `client/src/db/types.ts`, and update services so they map between the two layers.
3. **Implement `saveLectureDraft` action** with validation (e.g. Zod schema) to guard the incoming JSON before persistence.
4. **Replace mock timeline data** in `timeline-editor-content.tsx`, `timeline-tracks.tsx`, etc. with the provider state loaded from the real snapshot.
5. **Enhance workflow feedback** by wiring the existing Inngest progress events to the editor so users see background updates in real time.
6. **Future extensions**: If collaboration or branching becomes necessary, the revision table already lays the groundwork for diffing or CRDT adoption without reworking the core flow.

This design keeps the implementation straightforward, leverages the tools already in the repo, and gives clear guardrails for auto-saving, workflow integration, and future growth.
