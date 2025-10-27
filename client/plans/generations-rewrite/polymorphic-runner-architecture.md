### Polymorphic Runner Architecture

Your plan to leverage Vercel Workflow (great timing—it's a natural evolution from Inngest, with built-in durability, retries, and observability via the dashboard) while keeping CLI local/simple is spot-on. The key is **polymorphism via abstraction layers**: Make the core build logic (DAG planning, job queuing, state management) independent of execution/storage, then inject runtime-specific implementations. This enables reuse across frontends without duplication.

I'll outline the architecture, why a separate Nitro app shines for cloud, implementation steps, and trade-offs. It builds on your FS/S3 storage idea (FlyStorage as a thin adapter) and the feedback doc's planner/runner split.

#### High-Level Architecture
- **Shared Core Library** (`@yourorg/video-builder-core`): The "brain" of the system—handles DAG construction, dirty propagation, Kahn's layering, job specs, hashing, and assembly. Outputs serialized plans (JSON) and consumes job outcomes. No direct I/O or concurrency—pure functions.
- **Storage Abstraction** (`FlyStorage`): A unified interface (e.g., `class FlyStorage { async write(key: string, data: any): Promise<void>; async read(key: string): Promise<any>; }`) with impls:
  - `LocalFlyStorage`: FS ops (e.g., `fs.promises.writeFile`).
  - `S3FlyStorage`: AWS SDK (e.g., `s3.putObject`).
- **Executor Abstraction** (`Executor`): Handles job dispatch/parallelism/retries.
  - `LocalExecutor`: Simple concurrency (e.g., `p-limit` for rate-limiting batches).
  - `WorkflowExecutor`: Maps jobs to Vercel Workflow steps (e.g., each layer/batch → a workflow function with `Promise.all` on steps).
- **Runners**:
  - **CLI Runner**: Node.js binary/script using core + local storage + local executor. Runs end-to-end locally.
  - **Cloud Runner**: Nitro app using core + S3 storage + workflow executor. Exposed as API endpoints (e.g., `/api/start-build`, `/api/resume`).
- **Frontends** (Loose Coupling):
  - **Next.js App**: Calls cloud runner's API (e.g., POST to Nitro endpoint with video_id/prompt). Polls or webhooks for status.
  - **CLI App** (with TUI, e.g., via Ink.js): Invokes local runner directly (e.g., `video-builder --prompt "Civil War" --output ./build/`).
  - **Future (Expo/Mobile/Desktop)**: Same as Next.js—API calls to cloud runner for remote builds; fallback to local if device supports (e.g., desktop with Node).

Flow:
1. Frontend triggers build (e.g., user submits prompt).
2. Runner (local/cloud) loads CUIs/TAGs from storage, plans DAG (core lib), executes layers.
3. On completion/failure: Update metadata in storage; notify frontend (e.g., webhook or poll via Postgres summary).

This is "backend-as-a-service" for builds: Reusable, scalable, and frontend-agnostic. The separate Nitro app prevents Next.js bloat (no workflow directives polluting your app code) and lets you scale builds independently (e.g., higher Vercel limits for workflows).

#### Why a Separate Nitro App for Cloud?
Yes—**strongly recommended**. Here's why it fits your multi-frontend vision:
- **Isolation & Focus**: Next.js stays lean (UI/API for users/videos). Nitro handles heavy orchestration (workflows/steps for GEN calls). No mixing concerns—your Next.js just proxies requests to Nitro (e.g., via internal Vercel routing or direct fetch).
- **Scalability**: Vercel Workflow shines in Nitro: Built-in queues for steps, durable state, and observability (dashboard traces per build). Deploy Nitro separately (e.g., `vercel deploy --prod` for runner only).
- **Reusability**: All frontends hit the same Nitro API (e.g., `/api/builds/{video_id}/start`). CLI can optionally sync to S3 for "remote local" mode (e.g., plan local, execute on cloud).
- **Cost/Perf**: Workflows are billed per step/storage (cheap at beta: 50k steps free). Offload from Next.js invocations (which bill per function duration).
- **Dev Workflow**: Local dev: Run Nitro + Next.js side-by-side (`npm run dev` in both). CLI: Standalone.
- **Future-Proof**: Easy to add auth (e.g., Vercel Edge Middleware in Nitro) or multi-tenancy (workspace_id in paths).

If you *must* inline in Next.js (e.g., for simplicity), you could—but it'd couple your UI to build logic, hurting modularity.

#### Implementation Guide
Assume TypeScript/Node ecosystem. Publish core as NPM for easy import.

1. **Shared Core Library** (`packages/video-builder-core` in monorepo):
   - Exports: `planBuild(inputs: BuildInputs): BuildPlan` (Kahn's layers as `{layers: JobSpec[][]}`), `markDirty(tags: Tag[], changes: ChangeSet): void`, `assembleTimeline(plan: BuildPlan, assets: AssetMap): TimelineDTO`, etc.
   - Uses your FS structure: Expects storage impl to handle reads/writes (e.g., `storage.write('dag/tags.jsonl', line)`).
   - No deps on workflow/storage—inject via interfaces.
   - Example Snippet (planner.ts):
     ```typescript
     import type { FlyStorage, Executor } from './adapters'; // Abstracts

     export interface BuildPlan { layers: JobSpec[][]; queueHash: string; }
     export async function runBuild(inputs: BuildInputs, storage: FlyStorage, executor: Executor): Promise<BuildResult> {
       const plan = planBuild(inputs); // Kahn's here
       await storage.write('dag/plan.json', plan);
       let result = { success: true, assets: {} };
       for (const layer of plan.layers) {
         const outcomes = await executor.executeLayer(layer); // Polymorphic dispatch
         // Update tags, propagate errors
         if (outcomes.some(o => o.failed)) {
           markDirty(/*...*/);
           result.success = false;
           break;
         }
       }
       if (result.success) {
         result.timeline = assembleTimeline(plan, /*...*/);
       }
       return result;
     }
     ```

2. **Storage Abstraction** (`packages/video-builder-core/adapters/storage.ts`):
   ```typescript
   export abstract class FlyStorage {
     abstract write(key: string, data: any): Promise<void>;
     abstract read(key: string): Promise<any>;
     abstract list(prefix: string): Promise<string[]>;
     // e.g., appendToJsonl(key: string, line: any)
   }

   export class LocalFlyStorage extends FlyStorage {
     basePath: string;
     async write(key: string, data: any) {
       await fs.mkdir(path.dirname(`${this.basePath}/${key}`), { recursive: true });
       await fs.writeFile(`${this.basePath}/${key}`, JSON.stringify(data));
     }
     // ...
   }

   export class S3FlyStorage extends FlyStorage {
     s3: S3Client;
     bucket: string;
     async write(key: string, data: any) {
       await this.s3.putObject({ Bucket: this.bucket, Key: key, Body: JSON.stringify(data) });
     }
     // Use ListObjectsV2 for list; GetObject for read
   }
   ```

3. **Executor Abstraction** (`packages/video-builder-core/adapters/executor.ts`):
   ```typescript
   export interface JobSpec { genId: string; provider: string; deps: string[]; /*...*/ }
   export abstract class Executor {
     abstract executeLayer(layer: JobSpec[]): Promise<JobOutcome[]>;
     // Batch by provider, handle retries
   }

   export class LocalExecutor extends Executor {
     concurrency: { [provider: string]: number } = { openai: 5, replicate: 2 };
     async executeLayer(layer: JobSpec[]) {
       const batches = groupByProvider(layer); // Helper
       const outcomes: JobOutcome[] = [];
       for (const [provider, jobs] of Object.entries(batches)) {
         const limiter = pLimit(this.concurrency[provider] || 1);
         const batchOutcomes = await Promise.allSettled(
           jobs.map(job => limiter(() => runGenJob(job))) // Your GEN wrapper (e.g., OpenAI call)
         );
         outcomes.push(...batchOutcomes.map(o => ({ ...o, provider })));
       }
       return outcomes;
     }
   }

   export class WorkflowExecutor extends Executor {
     // Maps to Vercel Workflow: Each layer → a workflow fn with steps
     async executeLayer(layer: JobSpec[]) {
       // Serialize layer to storage first
       const layerId = `layer-${Date.now()}`;
       await storage.write(`checkpoints/${layerId}.json`, layer);
       // Trigger workflow: e.g., await start(executeWorkflowLayer, [layerId])
       // Workflow fn: "use workflow"; for each job in layer: await Promise.all(batchSteps(jobs))
       // Steps: "use step"; e.g., async function openaiStep(job: JobSpec) { /* call API */ }
       // Wait for completion via webhook or poll storage
       return await pollOutcomes(layerId); // Custom helper
     }
   }
   ```

4. **CLI Runner** (`cli/src/index.ts`—use Commander.js for args, Ink for TUI):
   ```typescript
   import { runBuild } from '@yourorg/video-builder-core';
   import { LocalFlyStorage } from '@yourorg/video-builder-core/adapters';
   import { LocalExecutor } from '@yourorg/video-builder-core/adapters';

   async function main() {
     const videoId = process.argv[2] || 'default';
     const storage = new LocalFlyStorage(`./builds/${videoId}`);
     const executor = new LocalExecutor();
     const inputs = { prompt: '...', duration: 30 /* from args */ };
     const result = await runBuild(inputs, storage, executor);
     // TUI: Render progress, errors; on success: open video
     console.log(result.timeline ? 'Build complete!' : 'Failed');
   }
   ```
   - Package as `npx video-builder-cli`.
   - For "cloud sync": Add flag `--remote` → use S3 storage + WorkflowExecutor (triggers remote Nitro).

5. **Cloud Runner** (Nitro App: `runner-app/`):
   - Follow Nitro guide: `npx giget@latest nitro runner-app --install; cd runner-app; pnpm i @yourorg/video-builder-core aws-sdk`.
   - `nitro.config.ts`: Add `workflow/nitro` module.
   - Workflows/Steps: In `server/workflows/build.ts`—use core lib inside workflow fns.
     ```typescript
     // server/workflows/build.ts
     import { runBuild } from '@yourorg/video-builder-core';
     import { S3FlyStorage, WorkflowExecutor } from '@yourorg/video-builder-core/adapters';
     import { sleep, createWebhook } from 'workflow';

     export async function buildVideoWorkflow(videoId: string, inputs: BuildInputs) {
       "use workflow";
       const storage = new S3FlyStorage({ bucket: 'your-bucket' });
       const executor = new WorkflowExecutor(storage); // Self-referential for steps
       const result = await runBuild(inputs, storage, executor);
       // Post-assemble: await uploadToS3(result.timeline); etc.
       return result;
     }

     // Steps: e.g., server/steps/gen-job.step.ts
     async function openaiGenStep(job: JobSpec) {
       "use step";
       // Call OpenAI, return outcome
       // maxRetries = 3; or custom RetryableError for rate limits
     }
     ```
   - API Routes: `server/api/builds/[videoId]/start.post.ts`:
     ```typescript
     import { start } from 'workflow/api';
     import { buildVideoWorkflow } from '../../workflows/build';
     import { readBody } from 'h3';

     export default defineEventHandler(async (event) => {
       const { videoId } = getRouterParams(event);
       const { inputs } = await readBody(event);
       await start(buildVideoWorkflow, [videoId, inputs]);
       return { message: 'Build started', videoId };
     });
     ```
     - Add `/status` route: Poll storage for metadata.json.
     - Deploy: `vercel --prod` (links to your Postgres for user/video pointers).

6. **Frontend Integration**:
   - **Next.js**: In `/api/proxy/build` (or direct fetch): POST to `https://your-runner.vercel.app/api/builds/${videoId}/start`.
   - **CLI**: As above—local by default.
   - **Polling/Webhooks**: For async updates, use Workflow's `createWebhook` in runner → POST to Next.js/CLI endpoint.

#### Trade-Offs & Tips
- **Pros**: Modular (easy tests: Mock storage/executor), offline CLI, scalable cloud. Aligns with Vercel (Nitro + Workflow = zero-config queues).
- **Cons**: 
  - Overhead: Extra dep (core lib). Mitigate: Monorepo (Turborepo) for builds.
  - Sync Complexity: CLI-to-cloud? Add `--upload` flag (sync FS to S3 post-build).
  - Retries: Local uses manual (e.g., in `runGenJob`); cloud gets Workflow's `RetryableError` (perfect for 429s—use `retryAfter` from provider headers).
- **Observability**: Cloud: Vercel dashboard. CLI: Log to files/stdout; add `npx workflow inspect` for local mocks.
- **Security**: Nitro API: Add API keys or Vercel auth. Storage: Prefix keys by user/workspace.
- **Next**: Prototype core lib first (unit test Kahn's with mock DAG). Then stub runners. For mobile/desktop: Use Capacitor/Tauri to embed Node runner locally.

This gives you a robust, evolvable system—hit me up for code skeletons!