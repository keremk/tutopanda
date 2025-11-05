Corrected Architecture: Event Log Resolution During Execution

  The Key Insight

  During a run, artifacts are resolved by streaming the live event log (events/artefacts.log), NOT by reading manifests.

  Event Log Interface (core/src/event-log.ts:14-19):
  export interface EventLog {
    streamInputs(movieId: string, sinceRevision?: RevisionId): AsyncIterable<InputEvent>;
    streamArtefacts(movieId: string, sinceRevision?: RevisionId): AsyncIterable<ArtefactEvent>;  // ← KEY
    appendInput(movieId: string, event: InputEvent): Promise<void>;
    appendArtefact(movieId: string, event: ArtefactEvent): Promise<void>;
  }

  How It SHOULD Work (During Execution)

  Scenario: ImageToVideoProducer needs SegmentStartImage blob from StartImageProducer

  Layer 0: StartImageProducer executes
    ↓
    1. Produces image Uint8Array
    2. runner.ts calls persistBlob() → saves to blobs/{prefix}/{hash}
    3. runner.ts calls eventLog.appendArtefact() → appends to events/artefacts.log:
       {
         "artefactId": "Artifact:SegmentImage[segment=0]",
         "output": {
           "blob": {
             "hash": "abc123...",
             "size": 54321,
             "mimeType": "image/png"
           }
         },
         "status": "succeeded",
         ...
       }

  Layer 1: ImageToVideoProducer needs to execute
    ↓
    job.inputs = ["Artifact:SegmentImage[segment=0]"]
    ↓
    [MISSING CODE SHOULD GO HERE in runner.ts before calling produce()]
    ↓
    const resolvedBlobs = await resolveArtifactsFromEventLog({
      artifactIds: job.inputs,
      eventLog,
      storage,
      movieId,
    });

    // resolveArtifactsFromEventLog() does:
    async function resolveArtifactsFromEventLog(args) {
      const resolved = {};

      // Stream the live event log that's being written to during this run
      for await (const event of args.eventLog.streamArtefacts(args.movieId)) {
        if (event.status === 'succeeded' && args.artifactIds.includes(event.artefactId)) {
          if (event.output.blob) {
            // Read the blob from FlyStorage
            const blobPath = args.storage.resolve(
              args.movieId,
              'blobs',
              event.output.blob.hash.slice(0, 2),
              event.output.blob.hash
            );
            const blobData = await args.storage.storage.read(blobPath);

            // Generate accessible reference (Buffer or file:// URL)
            resolved[extractArtifactKind(event.artefactId)] = blobData;
          } else if (event.output.inline) {
            resolved[extractArtifactKind(event.artefactId)] = event.output.inline;
          }
        }
      }

      return resolved;
    }

    ↓
    // Pass resolved blobs to produce()
    const result = await produce({
      movieId,
      job: {
        ...job,
        context: {
          ...job.context,
          extras: {
            ...job.context.extras,
            resolvedInputs: {
              ...cliInputs,        // From CLI (prompt, audience, etc.)
              ...resolvedBlobs,    // From event log (blobs from previous steps)
            }
          }
        }
      },
      ...
    });

  What EXISTS vs What's MISSING

  ✅ EXISTS:
  1. Event log append (runner.ts:305): await context.eventLog.appendArtefact(context.movieId, event);
  2. Blob persistence (runner.ts:311-336): Blobs saved to blobs/{prefix}/{hash}
  3. Event streaming API (event-log.ts:30-32): streamArtefacts(movieId, sinceRevision)
  4. FlyStorage abstraction (storage.ts): Works with local FS and S3

  ❌ MISSING:
  1. Artifact resolution from event log (should be in runner.ts:190 before produce() call)
  2. Blob reading logic (read from FlyStorage using BlobRef.hash)
  3. Population of resolvedInputs with blob data/URLs

  FlyStorage Details You Mentioned

  Reading blobs via FlyStorage (storage.ts:1-2):
  import { FileStorage } from '@flystorage/file-storage';
  import { InMemoryStorageAdapter } from '@flystorage/in-memory';
  import { LocalStorageAdapter } from '@flystorage/local-fs';

  Storage context provides (storage.ts:25-32):
  export interface StorageContext {
    storage: FileStorage;          // FlyStorage instance
    basePath: string;
    resolve(movieId: string, ...segments: string[]): string;
    append(relativePath: string, data: string, mimeType?: string): Promise<void>;
  }

  Reading a blob would be:
  const blobPath = storage.resolve(movieId, 'blobs', prefix, hash);
  const blobData = await storage.storage.read(blobPath);  // Returns Uint8Array

  The Implementation Gap

  Location: core/src/runner.ts:190 - This is where resolution should happen:

  async function executeJob(job: JobDescriptor, context: RunnerJobContext): Promise<JobResult> {
    const { movieId, layerIndex, attempt, revision, produce, logger, clock, storage, eventLog } = context;
    const startedAt = clock.now();
    const inputsHash = hashInputs(job.inputs);

    try {
      // ⚠️ MISSING: Resolve artifacts from event log BEFORE calling produce
      const resolvedArtifacts = await resolveArtifactsFromEventLog({
        artifactIds: job.inputs,
        eventLog,
        storage,
        movieId,
      });

      // Merge with existing context
      const enrichedContext = {
        ...job.context,
        extras: {
          ...(isRecord(job.context) ? job.context.extras : {}),
          resolvedInputs: {
            // CLI inputs come from somewhere else (passed in from CLI)
            // Artifact blobs come from event log
            ...resolvedArtifacts,
          }
        }
      };

      const result = await produce({
        movieId,
        job: { ...job, context: enrichedContext },  // Pass enriched context
        layerIndex,
        attempt,
        revision,
      });

      // ... rest of executeJob

  Why Manifests Are Different

  Manifests (manifest.ts:48-54):
  - Built AFTER successful execution via buildFromEvents()
  - Stream entire event log to collect final state
  - Saved to manifests/{revision}.json
  - Used for incremental rebuilds and resuming from checkpoints
  - NOT used during execution of current run

  Event Log (event-log.ts):
  - Live, append-only JSONL during execution
  - Each step reads it to find artifacts from previous steps in same run
  - Persists across runs for audit trail and manifest building

  Summary of Corrected Logic

  1. Step N produces artifact:
    - Blob written to blobs/{hash} via FlyStorage
    - Event appended to events/artefacts.log with BlobRef
  2. Step N+1 needs that artifact:
    - job.inputs = ["Artifact:SegmentImage[segment=0]"]
    - [MISSING] Runner streams eventLog.streamArtefacts(movieId)
    - [MISSING] Finds latest succeeded event for artifact ID
    - [MISSING] Reads blob from FlyStorage using BlobRef.hash
    - [MISSING] Populates context.extras.resolvedInputs
    - Producer receives resolved blob in runtime.inputs.all()
  3. After all steps succeed:
    - buildFromEvents() streams entire event log
    - Builds final manifest snapshot
    - Saves to manifests/{revision}.json