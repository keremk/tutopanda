# Implementation Plan: Phase 1 - Core Library Basics

This plan focuses on **Phase 1: Building the Core**, specifically the foundational step of implementing basic data structures, configuration handling, and initialization. The goal is to create a callable entrypoint (e.g., `initializeBuild(videoId, inputs)`) that:
- Sets up the per-video folder structure (local FS or S3-backed).
- Initializes editable CUIs (e.g., `LectureConfig` from defaults + user inputs).
- Expands and writes the DAG (`nodes.json`) based on config (e.g., `useVideo`, `n`, `m`).
- Creates initial metadata, snapshots, and empty append-only files.
- Computes initial hashes for CUIs.
- Prepares for planning/running without executing GENs yet.

This establishes a "blank slate" for builds/regens, ensuring the system is testable and extensible. We'll use TypeScript in a monorepo setup (e.g., Turborepo) for the core lib (`packages/video-builder-core`). Total effort: 1-2 days for MVP.

## Overview
- **Scope**: Core lib only—no runner/executor yet. Focus on storage, config serialization, DAG expansion, and init logic.
- **Non-Goals**: Full dirty detection, GEN execution, or UI/CLI integration. Defer to Phase 2.
- **Assumptions**:
  - Node.js 20+; TypeScript 5+.
  - S3 for cloud (via `@aws-sdk/client-s3`); local FS fallback.
  - Zod for validation; `json-stable-stringify` for hashing.
  - Video IDs: UUIDs (e.g., `vid_123`).
- **Success Criteria**: Run `initializeBuild('vid_123', {prompt: 'Civil War', duration: '60'})` → Folder created with all files; `nodes.json` expanded correctly (e.g., n=6 for 60s @10s/seg); hashes computed; no errors.

## Prerequisites & Setup
1. **Project Structure** (Monorepo):
   ```
   tutopanda/
   └── shared/
   │       ├── src/
   │       │   ├── index.ts          # Exports: initializeBuild, types, etc.
   │       │   ├── storage.ts        # FlyStorage impls
   │       │   ├── config.ts         # LectureConfig handling, hashing
   │       │   ├── dag.ts            # Node expansion, nodes.json
   │       │   ├── utils.ts          # Hashing, path helpers
   │       │   └── types.ts          # Refined from provided types.ts
   │       ├── package.json
   │       └── tsconfig.json
   ```
   - Root `package.json`: `"workspaces": ["packages/*"]`, deps: `typescript`, `zod`, `json-stable-stringify`, `@aws-sdk/client-s3`, `uuid`, `crypto` (built-in).
   - Core `package.json`: `"main": "dist/index.js"`, scripts: `"build": "tsc"`, `"dev": "tsc --watch"`.

2. **Install Deps**:
   ```
   npm i -w @ root typescript zod json-stable-stringify @aws-sdk/client-s3 uuid
   npm i -D -w @types/node ts-node
   npx tsc --init  # In core package
   ```

3. **Env Vars** (for S3 testing):
   - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET=your-bucket`.
   - Local: No env needed.

4. **Base Types** (src/types.ts): Refine from provided `types.ts`.
   ```typescript
   import { z } from 'zod';
   // ... (import all schemas from types.ts: LectureConfig, etc.)
   import crypto from 'crypto';
   import stringify from 'json-stable-stringify';

   export type VideoId = string;
   export type Revision = number;
   export type Hash = string;

   // From types.ts (paste refined CUI/TAG/Snapshot/Node here)
   export interface CUI { /* ... as per proposal */ }
   export interface TAG { /* ... */ }
   export interface Snapshot { /* ... */ }
   export interface Node { /* ... */ }

   // BuildInputs: User call params
   export const BuildInputsSchema = z.object({
     videoId: z.string(),
     prompt: z.string(),  // inquiry_prompt
     duration: z.enum(videoDurationValues).default('60'),
     audience: z.enum(audienceValues).default('Adults'),
     // ... other optional: useVideo: z.boolean().default(false), etc.
   });
   export type BuildInputs = z.infer<typeof BuildInputsSchema>;

   // InitResult
   export interface InitResult {
     videoId: VideoId;
     revision: Revision;  // Starts at 0
     s3Prefix?: string;   // If S3
     totalSizeBytes: number;  // Initial ~0
   }

   // Hash util
   export function computeHash(obj: any, depsHashes: string[] = []): Hash {
     const canonical = stringify({ ...obj, deps: depsHashes.sort() });
     return crypto.createHash('sha256').update(canonical).digest('hex');
   }
   ```

## Step-by-Step Implementation
Implement in order; test each with a simple script (e.g., `src/test-init.ts`).

### Step 1: Storage Abstraction (src/storage.ts)
- Impl `FlyStorage` base + Local/S3 adapters.
- Methods: `write(key: string, data: any)`, `read(key: string)`, `mkdir(prefix: string)`, `list(prefix: string)`, `delete(prefix: string)`.
- Key format: Relative to video root (e.g., `dag/nodes.json`).

```typescript
// src/storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

export abstract class FlyStorage {
  abstract write(key: string, data: any): Promise<void>;
  abstract read(key: string): Promise<any>;
  abstract mkdir(dir: string): Promise<void>;  // Ensure dir exists
  abstract list(prefix: string): Promise<string[]>;  // Keys under prefix
  abstract delete(prefix: string): Promise<void>;  // Bulk delete under prefix
}

export class LocalFlyStorage extends FlyStorage {
  basePath: string;
  constructor(basePath: string) { this.basePath = basePath; }

  async write(key: string, data: any): Promise<void> {
    const fullPath = path.join(this.basePath, key);
    await this.mkdir(path.dirname(fullPath));
    await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
  }

  async read(key: string): Promise<any> {
    const fullPath = path.join(this.basePath, key);
    try { return JSON.parse(await fs.readFile(fullPath, 'utf-8')); }
    catch { throw new Error(`Key not found: ${key}`); }
  }

  async mkdir(dir: string): Promise<void> {
    const fullDir = path.join(this.basePath, dir);
    await fs.mkdir(fullDir, { recursive: true });
  }

  async list(prefix: string): Promise<string[]> {
    const fullPrefix = path.join(this.basePath, prefix);
    // Impl: fs.readdirSync(fullPrefix, { withFileTypes: true }) → filter files, map to keys
    return [];  // Stub; expand as needed
  }

  async delete(prefix: string): Promise<void> {
    // Impl: rimraf or fs.rm(prefix, { recursive: true })
    console.warn(`Delete stub: ${prefix}`);
  }
}

export class S3FlyStorage extends FlyStorage {
  client: S3Client;
  bucket: string;
  constructor(bucket: string) {
    super();
    this.bucket = bucket;
    this.client = new S3Client({ region: 'us-east-1' });  // Env-configurable
  }

  async write(key: string, data: any): Promise<void> {
    const params = {
      Bucket: this.bucket,
      Key: key,  // e.g., videos/vid_123/dag/nodes.json
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    };
    await this.client.send(new PutObjectCommand(params));
  }

  async read(key: string): Promise<any> {
    const params = { Bucket: this.bucket, Key: key };
    const { Body } = await this.client.send(new GetObjectCommand(params));
    const str = await Body.transformToString();
    return JSON.parse(str);
  }

  async mkdir(_dir: string): Promise<void> {
    // S3 prefixes are implicit; no-op
  }

  async list(prefix: string): Promise<string[]> {
    const params = { Bucket: this.bucket, Prefix: prefix, Delimiter: '/' };
    const { Contents } = await this.client.send(new ListObjectsV2Command(params));
    return Contents?.map(obj => obj.Key!) || [];
  }

  async delete(prefix: string): Promise<void> {
    const keys = await this.list(prefix);
    if (keys.length) {
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map(k => ({ Key: k })) },
      }));
    }
  }
}
```

- **Test**: `const storage = new LocalFlyStorage('./test-vid'); await storage.write('test.json', {foo: 'bar'}); console.log(await storage.read('test.json'));`.

### Step 2: Config Handling & Hashing (src/config.ts)
- Load/validate `LectureConfig` from inputs + defaults.
- Serialize to `configuration.json`; append initial line to `cuis.jsonl`.
- Compute hashes; create initial snapshot-0.

```typescript
// src/config.ts
import { z } from 'zod';
import { DEFAULT_LECTURE_CONFIG, LectureConfig, BuildInputs, computeHash, CUI, Snapshot } from './types';  // Assume CUI is array of configs

export function createConfig(inputs: BuildInputs): LectureConfig {
  const base = { ...DEFAULT_LECTURE_CONFIG };
  base.general.duration = inputs.duration;
  base.general.audience = inputs.audience;
  base.general.language = 'en';  // Etc.; map inputs to fields
  // Compute n, m: n = parseInt(duration) / 10; m = base.image.imagesPerSegment;
  return base;
}

export async function initializeCuis(storage: FlyStorage, videoId: string, config: LectureConfig): Promise<CUI[]> {
  const timestamp = new Date().toISOString();
  const cuis: CUI[] = [];  // Flatten config to CUI objects, e.g., {id: 'general_duration', content: {duration: '60'}, hash: computeHash({duration: '60'}), rev: 0, created_at: timestamp}
  // Impl: For each field (e.g., general.duration → separate CUI? Or one big? Proposal: One per major section (general, image, etc.)
  const generalCui: CUI = { id: 'general_config', rev: 0, content: config.general, hash: computeHash(config.general), created_at: timestamp, edited_by: 'system' };
  cuis.push(generalCui);
  // ... for other sections

  // Write current
  await storage.write('configuration.json', config);

  // Append to jsonl (as array of lines for now; later stream)
  const jsonlPath = 'dag/cuis.jsonl';
  const existing = await storage.read(jsonlPath)?.lines || [];  // Stub; impl JSONL parser
  existing.push(...cuis.map(c => JSON.stringify(c)));
  await storage.write(jsonlPath, { lines: existing });  // Temp; use append util later

  return cuis;
}

export function createInitialSnapshot(rev: 0, cuis: CUI[], tagHashes: Record<string, Hash> = {}): Snapshot {
  return {
    revision: 0,
    cui_hashes: cuis.reduce((acc, c) => ({ ...acc, [c.id]: c.hash }), {}),
    tag_hashes: tagHashes,
    plan_ref: null,
    timeline: null,
    status: 'planned',
    changed_since_prev: [],
    created_at: new Date().toISOString(),
  };
}
```

- **Test**: `const config = createConfig({videoId: 'test', prompt: 'hi'}); const cuis = await initializeCuis(storage, 'test', config);`.

### Step 3: DAG Expansion (src/dag.ts)
- Load base nodes from JSON/TS (e.g., import from nodes.js sample).
- Expand based on config: Prune branches (e.g., if !useVideo, skip video gens); instantiate n/m (e.g., append _0, _1 to IDs).
- Add edges array.
- Write to `dag/nodes.json`.

```typescript
// src/dag.ts
import { Node, NodeTemplate } from './types';  // NodeTemplate: base unexpanded

// Base templates (from nodes.js sample; array of partial Node)
const baseNodes: NodeTemplate[] = [ /* Paste from nodes.js */ ];

export function expandDag(config: LectureConfig): { nodes: Node[], edges: Edge[] } {
  const { useVideo, isImageToVideo, n, m } = deriveCardinality(config);  // e.g., n = parseInt(config.general.duration) / 10;
  const expanded: Node[] = [];
  const edges: { from: string, to: string }[] = [];

  for (const template of baseNodes) {
    if (template.id.includes('image_to_video') && !isImageToVideo) continue;  // Prune
    if (template.id.includes('text_to_video') && !useVideo) continue;

    const node: Node = { ...template, description: `${template.description} (n=${n}, m=${m})` };
    expanded.push(node);

    // Add edges: For each input/output, if cardinality 'n', fan-out (e.g., script_gen outputs: narration_segment_script_${i} for i=0 to n-1)
    // Impl: Switch on cardinality, push {from: input, to: node.id} and {from: node.id, to: output}
    // E.g., for audio_gen: for i=0; i<n; i++ { edges.push({from: `narration_segment_script_${i}`, to: 'audio_gen'}); edges.push({from: 'audio_gen', to: `narration_audio_asset_${i}`}); }

    // ... full impl based on diagram
  }

  // Add assemble node edges
  return { nodes: expanded, edges };
}

export interface Edge { from: string; to: string; }

function deriveCardinality(config: LectureConfig) {
  const durationSec = parseInt(config.general.duration);
  const segmentLen = parseInt(config.narration.segmentLength) || 10;
  return { n: durationSec / segmentLen, m: config.image.imagesPerSegment, useVideo: config.general.useVideo, isImageToVideo: false /* from config.video */ };
}
```

- **Test**: `const dag = expandDag(config); console.log(JSON.stringify(dag, null, 2));` → Verify n=6 nodes, edges count ~50.

### Step 4: Initialization Orchestrator (src/index.ts)
- Glue: Create storage, config, cuis, dag, initial snapshot, metadata.
- Write all to storage; mkdir 'dag/snapshots/', 'assets/', etc.

```typescript
// src/index.ts
import { FlyStorage, LocalFlyStorage, S3FlyStorage } from './storage';
import { BuildInputs, InitResult } from './types';
import { createConfig, initializeCuis, createInitialSnapshot } from './config';
import { expandDag } from './dag';

export async function initializeBuild(inputs: BuildInputs, useS3: boolean = false, s3Bucket?: string): Promise<InitResult> {
  const { videoId } = inputs;
  const storage: FlyStorage = useS3 ? new S3FlyStorage(s3Bucket!) : new LocalFlyStorage(`./builds/${videoId}`);
  const prefix = useS3 ? `videos/${videoId}/` : '';

  // Mkdir root structure
  await storage.mkdir('dag/snapshots');
  await storage.mkdir('dag/plans');
  await storage.mkdir('dag/jobs');
  await storage.mkdir('dag/checkpoints');
  await storage.mkdir('assets/current');
  await storage.mkdir('assets/rev0');  // Initial rev

  // Config & CUIs
  const config = createConfig(inputs);
  const cuis = await initializeCuis(storage, videoId, config);

  // DAG
  const { nodes, edges } = expandDag(config);
  const nodesData = { nodes, edges, cuis: /* current cui values */, tags: /* empty placeholders */, config: /* flattened config params */, metadata: { expanded_at: new Date().toISOString(), description: `Initial DAG for ${videoId}` } };
  await storage.write('dag/nodes.json', nodesData);

  // Initial snapshot
  const snapshot = createInitialSnapshot(0, cuis);
  await storage.write(`dag/snapshots/rev0.json`, snapshot);

  // Metadata
  const metadata = {
    video_id: videoId,
    status: 'planned',
    latest_revision: 0,
    active_assets_prefix: 'assets/rev0/',
    oldest_kept_rev: 0,
    total_size_gb: 0,
    created_at: new Date().toISOString(),
  };
  await storage.write('metadata.json', metadata);

  // Empty jsonl stubs if needed
  await storage.write('dag/tags.jsonl', { lines: [] });

  return { videoId, revision: 0, s3Prefix: prefix, totalSizeBytes: 0 };
}

// Export all for lib use
export * from './types';
export * from './storage';
// etc.
```

- **Test Script** (test-init.ts):
  ```typescript
  import { initializeBuild } from './src';
  async function test() {
    const result = await initializeBuild({ videoId: 'test123', prompt: 'Civil War', duration: '30' });
    console.log('Init success:', result);
    // Verify files: fs.existsSync('./builds/test123/dag/nodes.json')
  }
  test();
  ```
  Run: `ts-node test-init.ts`.

## Testing & Validation
- **Unit Tests** (Jest/Mocha): Add `packages/video-builder-core/__tests__/`.
  - `config.test.ts`: `expect(createConfig(inputs)).toMatchSchema(LectureConfigSchema)`.
  - `dag.test.ts`: `expect(expandDag(config).nodes.length).toBe(7);` (for sample).
  - `storage.test.ts`: Mock S3 with `aws-sdk-client-mock`; test write/read roundtrip.
- **Integration**: Run init → Inspect folder: `ls -la builds/test123/` → jq `dag/nodes.json` for expansion.
- **Edge Cases**: Invalid duration → Zod error; S3 creds fail → Graceful fallback to local.
- **Perf**: Init <1s; hash computation fast.

## Next Steps (Post-Phase 1)
- **Phase 1.2**: Dirty detection + partial planning (load snapshot, BFS on edges).
- **Phase 2**: Add Executor abstraction; stub GEN calls (e.g., mock OpenAI).
- **Phase 3**: CLI wrapper (`commander.js` for `video-builder init`).
- **Deploy**: `npm publish` core; Turborepo build for monorepo.
- **Docs**: README.md with init flow diagram (Mermaid).

This gets you a solid foundation—start with storage (easiest), then config, DAG, orchestrator. Ping for code reviews or expansions!