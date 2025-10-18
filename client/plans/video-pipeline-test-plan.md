- Test Layout & Entry Point
    • Add client/tests/integration/generate-segment-videos.integration.test.ts.
    • Use Vitest to import the generateSegmentVideos Inngest function, but execute only its handler via our own stubbed Inngest
    runtime (mock @/inngest/client to expose a lightweight createFunction returning { id, fn }).
    • Seed process.env.MAX_VIDEO_GENERATION_CALLS = "5" inside the test to avoid the dev limit interfering.
  - Module Mocks & Spies
    • Mock @/inngest/functions/workflow-utils so createLectureLogger is a noop logger and createLectureProgressPublisher yields a spy-    able publishStatus.
    • Mock data access: @/data/project (return a dummy project), @/data/lecture/repository (spy on getLectureById to return different
    payloads per call and on updateLectureSnapshot if it’s touched), and @/services/lecture/persist (updateLectureContent should be a
    spy that records the final videos payload).
    • Mock storage: @/lib/storage-utils (return an in-memory file store) and @/services/lecture/storage so saving assets doesn’t hit
    disk but we can assert the filenames.
    • Mock AI stages by overriding @/services/lecture/orchestrators/video-orchestrator exports:
    – generateVideoSegmentPrompts → return an array built from inline prompt/LLM strings.
    – generateVideoStartingImages → read the seed mock (tests/integration/test-data/mock-replicate-image.bin, which you’ll supply) and    pretend it saved to storage, returning metadata.
    – generateVideoAssets → load your future mock-replicate-video.bin, return video assets containing startingImageUrl/labels, and
    confirm args (prompt text, aspect ratio, resolution, duration) match expectations.
    • Keep the provider registry module @/services/media-generation/video mocked so its registration is inert (no real Replicate
    calls).
  - Fixture & Prompt Data
    • Place placeholders under tests/integration/test-data/ for mock-replicate-image.bin and mock-replicate-video.bin; the test will
    read them (using fs.promises.readFile) so you can drop real fixtures later.
    • Inline a minimal two-segment lecture script plus the expected movie directions/prompt strings to confirm the pipeline forwards
    data correctly.
  - Test Flow
    • Build a fake Inngest ctx with event.data mirroring real payloads (userId, runId, lectureId, script, configs).
    • Implement a simple step helper where run(label, fn) records the label order and executes fn.
    • Call generateSegmentVideos.fn({ event, publish: { ... }, logger: {}, step }).
    • After await, assert:
    – generateVideoSegmentPrompts, generateVideoStartingImages, and generateVideoAssets each ran once with the transformed data from
    the previous stage.
    – updateLectureContent was called exactly twice (once from any path normalization if triggered, plus the final save) and the final    payload contains the expected videos array (ids, model slug, resolution, duration, startingImageUrl).
    – publishStatus saw the user-facing status strings (“Generating prompts…”, “Generating starting images…”, “Generating segment
    videos…”, “Videos generated successfully”).
    – getLectureById was invoked for skip check and (if applicable) path normalization, and the mock DB saves got the stitched video
    list.
    – The handler result matches the mocked assets (e.g., { runId, videos }).
  - Logging & Assertions
    • Use console.info (or the mocked logger) inside the stubs to log prompt snippets and asset ids for debugging.
    • Ensure no silent fallbacks: if any mocked stage returned an empty array, the test should fail, mirroring production behavior.

  Once this structure is ready, you can drop in your mock Replicate outputs and the test will exercise the full Inngest-level pipeline
  without hitting external services or the real database.