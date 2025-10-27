# Data Architecture
Yes, storing the DAG state and metadata in the filesystem (with S3 as the backing store for deployment) absolutely makes sense—it's a pragmatic, low-friction choice that aligns well with your goals for simplicity, asset locality, and CLI portability. I'll break down why it fits, how to implement it effectively, and how it addresses the open questions from the feedback doc, while flagging any trade-offs.

### Why It Makes Sense
- **Alignment with Assets**: Your generations produce chunky binary assets (images, audio, videos) that naturally live in S3 (or local FS for CLI runs). Co-locating DAG metadata (e.g., TAG versions, hashes, job IDs) as lightweight JSON files in the same bucket/folder keeps everything self-contained per video/project. No awkward cross-store joins or asset ID lookups—just `ls` or `aws s3 ls` to inspect a build. This reduces latency for regenerations (e.g., read a single JSON snapshot instead of querying Postgres) and simplifies cleanup (delete the folder to nuke orphans).
  
- **Postgres Complementarity**: You're already using Postgres for user-facing stuff (users, video overviews, iteration history). JSONB there *would* work for DAG state, but it's overkill: It bloats your DB with versioned graphs (potentially 100s of TAGs per video), invites schema drift, and hurts query perf for non-relational data like dependency trees. Instead, use Postgres sparingly: Store a *pointer* to the S3 prefix (e.g., `s3://bucket/videos/{video_id}/dag/`) plus high-level summaries (e.g., `status: 'complete' | 'failed'`, `total_cost: 0.42`, `last_updated: timestamp`). This keeps Postgres lean and relational where it shines (e.g., `SELECT * FROM videos WHERE status = 'dirty' ORDER BY updated_at` for a dashboard).

- **CLI/Local Portability**: Filesystem storage is inherently local-friendly. For a CLI tool (e.g., `claude-generate --query "Civil War" --output ./local_video/`), it writes to `./{video_id}/` with subfolders like `assets/` and `dag/`. On deploy, sync to S3 via `aws s3 sync`. No DB creds needed locally—perfect for devs or offline tinkering. Tools like `jq` or `yq` make it inspectable (`jq .dag/tags[] dirty_reason`).

- **Cost/Scale Wins**: S3 is dirt-cheap for infrequent access (e.g., $0.023/GB/month), with built-in versioning and lifecycle policies (e.g., delete failed builds after 7 days). Postgres JSONB adds unnecessary IOPS costs and scales poorly for blob-like data. Plus, it sidesteps the "state store" gap by making the FS the canonical source—durable, queryable via SDKs, and easy to version with Git or S3 versioning.

In short: It's a "store it where it lives" philosophy that echoes tools like Nix or Bazel (declarative builds with FS artifacts), which fits your MVP's evolution toward a robust, testable pipeline.

### Suggested Implementation
Organize per-video folders as a self-describing "build artifact" structure. Use JSON/JSONL for serialization—lightweight, human-readable, and parsable by your planner/runner.

#### Folder Structure Example
For a video `vid_123` (n=3 segments, m=2 images):
```
s3://your-bucket/videos/vid_123/
├── metadata.json          # High-level: {video_id, status, s3_prefix, total_cost, created_at}
├── assets/                # Binaries (uploaded post-gen)
│   ├── music.mp3
│   ├── narration_0.mp3
│   ├── narration_1.mp3
│   ├── narration_2.mp3
│   ├── images/seg0/img0.png
│   ├── images/seg0/img1.png
│   └── ... (videos if UseVideo=true)
└── dag/                   # State & metadata (JSON/JSONL for easy append/query)
    ├── nodes.json         # Full registry: {nodes: [{id: 'script_gen', type: 'GEN', dependencies: [], produces: ['video_summary', 'narration_script_0', ...], provider: 'openai'}, ...]}
    ├── tags.jsonl         # Per-TAG lines: {"id": "narration_script_0", "version": "v1.2", "checksum": "sha256:abc...", "producedBy": "script_gen", "dirtyReason": null, "failedAt": null}
    ├── plan-{timestamp}.json  # Serialized layers: {layers: [[{jobId: 'j1', genId: 'script_gen', ...}], ...], queueHash: "md5:xyz"}
    ├── jobs-{jobId}.json  # Per-job outcomes: {"jobId": "j1", "status": "success", "outputAssetId": "s3://.../narration_script_0.txt", "cost": 0.05}
    └── checkpoints/       # Layer snapshots for recovery
        └── layer-1-complete.json  # {completedJobs: ['j1', 'j2'], nextLayer: 2}
```

- **Serialization Details**:
  - **DAG Nodes/Tags**: Single JSON for the registry (immutable per plan); JSONL for tags (append-only for history). Use `sha256` on inputs (prompts + configs) for deterministic "dirty" checks—e.g., if upstream checksum changes, mark downstream dirty.
  - **Plans/Jobs**: Timestamped for audits; include idempotency keys (e.g., `{video_id}-{genId}-{version}`) for Vercel Workflow retries.
  - **Hashing**: Canonicalize inputs (e.g., sort keys in JSON prompts) before hashing. Libraries like `crypto` (Node) or `hashlib` (Python CLI) make this easy.

- **Write Flow** (in Runner):
  1. Planner writes `nodes.json` and initial `tags.jsonl` (mark all dirty on full run).
  2. For each layer: Write `plan-{ts}.json`, then dispatch batches → write `jobs-*.json` on completion.
  3. Post-job: Upload asset to `assets/`, append updated TAG line to `tags.jsonl` (e.g., `{"id": "...", "version": "v2", "checksum": "...", "dirtyReason": null}`).
  4. Checkpoint after layer: Write to `checkpoints/`.

- **Read Flow** (for Regen/Resume):
  1. Load `metadata.json` → get S3 prefix.
  2. Download `dag/nodes.json` and tail `tags.jsonl` (last N lines via `s3 cp` or SDK).
  3. Propagate dirtiness: Traverse reverse edges (from `nodes.json`), check checksums vs. persisted.
  4. Re-run Kahn's on dirty subgraph → new plan.

- **CLI Integration**: `claude-generate --video-id vid_123 --regen segment=1` reads `./vid_123/dag/`, plans locally, writes to `./assets/` and updates `dag/`. For S3: Wrap in `aws s3 sync --dryrun` flag.

- **S3-Specifics**:
  - Use prefixes as "virtual folders" (cheap).
  - Enable versioning for `dag/` (recover from bad writes).
  - Lifecycle: Transition `assets/` to Glacier after 30 days; delete failed folders via event triggers (e.g., if `status: 'failed'` in metadata).
  - Access: IAM policies per workspace/user for multi-tenancy.

#### Tying to Open Questions
- **State Store/Versioning**: FS *is* the store—`tags.jsonl` + `nodes.json` give you versions/hashes/timestamps/dependencies. No schema to maintain.
- **Deterministic Input Hashing**: Bake into TAG writes (hash CUIs + upstream TAGs). For regenerations, compare against persisted checksums.
- **Workflow Recovery**: Checkpoints let you resume: On crash, load latest `checkpoints/layer-X-complete.json`, re-plan from there. Idempotency keys prevent duplicates.
- **Data Locality/Costs**: All in one prefix—upload assets only on success (use temp local buffers). Cleanup: `aws s3 rm --recursive s3://.../vid_123/` on delete.
- **Timeline Assembly**: Define a `assembly-input.json` in `dag/` as the normalized DTO (e.g., `{segments: [{timing: {start: 0, duration: 10}, assets: {audioId: 'narration_0', images: ['img0.png', 'img1.png']}}]}`)—generated post-final layer.

### Potential Drawbacks & Mitigations
- **Queryability**: FS isn't great for complex queries (e.g., "all dirty videos across users"). **Mitigate**: Index summaries in Postgres (e.g., `{video_id, dag_prefix, num_dirty_tags, status}`). For CLI, use `find` or `jq` scripts.
- **Concurrency**: Multiple regenerations could race on writes. **Mitigate**: Use S3 atomic uploads (e.g., `putObject` with ETags) + lock files (e.g., `dag/lock-{video_id}.json` with lease TTL).
- **Size**: For huge videos (n=18, m=5 → 100+ tags), JSONs bloat. **Mitigate**: JSONL for logs; compress `dag/` zips if needed (but rare).
- **Local vs. Cloud Drift**: CLI runs might desync from S3. **Mitigate**: Always sync before/after (`aws s3 sync ./vid_123/ s3://...`), or make CLI cloud-optional.

This setup keeps your system lean, testable (mock FS with tmpfs), and extensible (e.g., add Git for DAG versioning later). If you share more on your stack (e.g., Node/Python for the runner), I can sketch code snippets!