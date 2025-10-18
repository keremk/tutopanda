import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { ImageGenerationParams } from "@/services/media-generation/image/types";
import type { VideoGenerationParams } from "@/services/media-generation/video/types";

const fixturesDir = resolve(process.cwd(), "tests", "integration", "test-data");
const seedImagePath = resolve(fixturesDir, "seed-image.jpg");
const seedVideoPath = resolve(fixturesDir, "seed-video.mp4");

// ---------------------------------------------------------------------------
// Inngest infrastructure mocks
// ---------------------------------------------------------------------------

vi.mock("@/inngest/client", () => {
  const createFunction = (_config: { id: string }, _trigger: unknown, handler: unknown) => ({
    id: _config.id,
    handler: handler as CallableFunction,
  });

  return {
    getInngestApp: () => ({
      createFunction,
    }),
  };
});

const statusMessages: string[] = [];
const publishStatusMock = vi.fn(async (message: string) => {
  statusMessages.push(message);
});
const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("@/inngest/functions/workflow-utils", () => ({
  createLectureLogger: () => loggerMock,
  createLectureProgressPublisher: () => ({ publishStatus: publishStatusMock }),
  LECTURE_WORKFLOW_TOTAL_STEPS: 7,
}));

// ---------------------------------------------------------------------------
// Storage mock (in-memory)
// ---------------------------------------------------------------------------

const storageFiles = new Map<string, Buffer>();

// ---------------------------------------------------------------------------
// Database mock (preserve repository logic while stubbing DB)
// ---------------------------------------------------------------------------

type SelectResponse = unknown[];
const selectResponses: SelectResponse[] = [];
let selectCallCount = 0;

const selectMock = vi.fn(() => {
  const limit = vi.fn(async () => {
    const response = selectResponses[selectCallCount] ?? [];
    selectCallCount += 1;
    return response;
  });
  const where = vi.fn(() => ({
    limit,
  }));
  const from = vi.fn(() => ({
    where,
  }));

  return { from };
});

const dbMock = {
  select: selectMock,
};

vi.mock("@/db/db", () => ({
  db: dbMock,
}));

vi.mock("@/lib/storage-utils", () => {
  const toBuffer = async (content: Buffer | Uint8Array | ReadableStream): Promise<Buffer> => {
    if (content instanceof Buffer) return Buffer.from(content);
    if (content instanceof Uint8Array) return Buffer.from(content);

    const reader = content.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  };

  const setupFileStorage = () => ({
    write: async (path: string, content: Buffer | Uint8Array | ReadableStream) => {
      storageFiles.set(path, await toBuffer(content));
    },
    readToBuffer: async (path: string) => {
      const file = storageFiles.get(path);
      if (!file) {
        throw new Error(`Mock storage: file ${path} not found`);
      }
      return Buffer.from(file);
    },
  });

  return { setupFileStorage };
});

// ---------------------------------------------------------------------------
// Database & persistence mocks
// ---------------------------------------------------------------------------

const getProjectByIdMock = vi.fn();
vi.mock("@/data/project", () => ({
  getProjectById: getProjectByIdMock,
}));

const updateLectureContentMock = vi.fn();
vi.mock("@/services/lecture/persist", () => ({
  updateLectureContent: updateLectureContentMock,
}));

// ---------------------------------------------------------------------------
// AI boundary mocks (LLM only)
// ---------------------------------------------------------------------------

const generateVideoPromptsMock = vi.fn();
vi.mock("@/services/media-generation/video/prompt-generator", () => ({
  generateVideoPrompts: generateVideoPromptsMock,
}));

// ---------------------------------------------------------------------------

beforeEach(() => {
  statusMessages.length = 0;
  publishStatusMock.mockClear();
  Object.values(loggerMock).forEach((fn) => fn.mockClear());
  storageFiles.clear();
  selectResponses.length = 0;
  selectCallCount = 0;
  selectMock.mockClear();
  getProjectByIdMock.mockReset();
  updateLectureContentMock.mockReset();
  generateVideoPromptsMock.mockReset();
});

describe("generateSegmentVideos Inngest function (integration)", () => {
  test("runs full pipeline with mocked LLM and providers", async () => {
    if (!existsSync(seedImagePath) || !existsSync(seedVideoPath)) {
      console.warn(
        "[generate-segment-videos.integration.test] Skipping: add seed-image.jpg and seed-video.mp4 to tests/integration/test-data/"
      );
      return;
    }

    const [seedImage, seedVideo] = await Promise.all([readFile(seedImagePath), readFile(seedVideoPath)]);

    // Set env BEFORE importing modules that read it at module scope
    process.env.MAX_VIDEO_GENERATION_CALLS = "5";

    // Ensure registries & models are available
    const [{ imageProviderRegistry }, { videoProviderRegistry }, models] = await Promise.all([
      import("@/services/media-generation/image/image-generator"),
      import("@/services/media-generation/video/video-generator"),
      import("@/lib/models"),
    ]);
    const { DEFAULT_IMAGE_MODEL, VIDEO_MODELS } = models;

    const { generateSegmentVideos } = await import("@/inngest/functions/generate-segment-videos");
    const handler =
      (generateSegmentVideos as unknown as { handler: CallableFunction }).handler ??
      (generateSegmentVideos as unknown as CallableFunction);

    const imageRequests: ImageGenerationParams[] = [];
    const videoRequests: VideoGenerationParams[] = [];

    imageProviderRegistry.register({
      name: "mock-image-provider",
      supportedModels: [DEFAULT_IMAGE_MODEL],
      generateImage: async (params: ImageGenerationParams) => {
        imageRequests.push(params);
        return Buffer.from(seedImage);
      },
    });

    const targetVideoModel = VIDEO_MODELS.BYTEDANCE_SEEDANCE_1_LITE;
    videoProviderRegistry.register({
      name: "mock-video-provider",
      supportedModels: [targetVideoModel],
      generateVideo: async (params: VideoGenerationParams) => {
        videoRequests.push(params);
        return Buffer.from(seedVideo);
      },
    });

    generateVideoPromptsMock.mockImplementation(
      async (_segment, _summary, index: number) => ({
        segmentStartImagePrompt: `image-prompt-${index}`,
        movieDirections: `movie-directions-${index}`,
      })
    );

    getProjectByIdMock.mockResolvedValue({ id: 55 });
    updateLectureContentMock.mockResolvedValue({});

    const userId = "user-123";
    const runId = "run-abc";
    const projectId = 55;
    const lectureId = 101;

    const baseLectureRow = {
      id: lectureId,
      projectId,
      title: "Seed Lecture",
      summary: null,
      script: null,
      images: [],
      videos: [],
      narration: [],
      music: [],
      effects: [],
      timeline: null,
      revision: 1,
      updatedAt: new Date(),
    };
    selectResponses.push([baseLectureRow]);

    const script = {
      segments: [
        { narration: "Segment one narration.", visuals: "Visual one" },
        { narration: "Segment two narration.", visuals: "Visual two" },
      ],
    };

    const videoConfig = {
      model: targetVideoModel,
      resolution: "480p",
      duration: "10",
    };

    const imageConfig = {
      width: 1024,
      height: 576,
      aspectRatio: "16:9" as const,
      size: "1080",
      style: "Ghibli",
      imagesPerSegment: 1,
    };

    const stepOrder: string[] = [];
    const step = {
      run: async <T>(label: string, fn: () => Promise<T> | T) => {
        stepOrder.push(label);
        return await fn();
      },
    };

    const publish = { event: vi.fn() };
    const invocationLogger = { info: vi.fn(), error: vi.fn() };

    const result = await handler({
      event: {
        data: {
          userId,
          runId,
          lectureId,
          projectId,
          script,
          lectureSummary: "Sample summary for testing.",
          videoConfig,
          imageConfig,
          maxVideoSegments: 5,
        },
      },
      publish,
      logger: invocationLogger,
      step,
    });

    // -----------------------------------------------------------------------
    // Assertions
    // -----------------------------------------------------------------------

    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(getProjectByIdMock).toHaveBeenCalledWith(projectId, userId);

    expect(generateVideoPromptsMock).toHaveBeenCalledTimes(script.segments.length);
    expect(imageRequests).toHaveLength(script.segments.length);
    expect(videoRequests).toHaveLength(script.segments.length);

    imageRequests.forEach((req) => {
      expect(req.aspectRatio).toBe("16:9");
      expect(req.size).toBe("1080");
    });

    videoRequests.forEach((req) => {
      expect(req.model).toBe(targetVideoModel);
      expect(req.resolution).toBe("480p");
      expect(req.duration).toBe(10);
      expect(req.startingImage.byteLength).toBeGreaterThan(0);
    });

    expect(updateLectureContentMock).toHaveBeenCalledTimes(1);
    const [firstCallArgs] = updateLectureContentMock.mock.calls;
    const [{ payload }] = firstCallArgs as [{ payload: { videos: Array<Record<string, unknown>> } }];
    const { videos } = payload;
    expect(videos).toHaveLength(2);
    videos.forEach((videoAsset, index) => {
      expect(videoAsset.id).toBe(`video-${runId}-${index}`);
      expect(videoAsset.label).toBe(`Segment ${index + 1} Video`);
      expect(videoAsset.model).toBe(targetVideoModel);
      expect(videoAsset.resolution).toBe("480p");
      expect(videoAsset.duration).toBe(10);
      expect(videoAsset.segmentStartImagePrompt).toBe(`image-prompt-${index}`);
      expect(videoAsset.movieDirections).toBe(`movie-directions-${index}`);
      expect(typeof videoAsset.startingImageUrl).toBe("string");
      expect((videoAsset.startingImageUrl as string)).toContain(
        `${userId}/${projectId}/${lectureId}/images/`
      );
    });

    expect(statusMessages).toEqual([
      "Generating prompts for 2 segments",
      "Generated prompts for 1/2 segments",
      "Generated prompts for 2/2 segments",
      "Generating starting images",
      "Generated starting image 1/2",
      "Generated starting image 2/2",
      "Generating segment videos",
      "Generated video 1/2",
      "Generated video 2/2",
      "Videos generated successfully",
    ]);

    expect(stepOrder).toEqual([
      "check-existing-videos",
      "validate-project-access",
      "generate-video-prompts",
      "generate-starting-images",
      "generate-video-assets",
      "save-generated-videos",
    ]);

    expect(result.runId).toBe(runId);
    expect(result.videos).toHaveLength(2);

    // -----------------------------------------------------------------------
    // Repository validation: subsequent reads surface stored videos
    // -----------------------------------------------------------------------
    selectResponses.push([
      {
        ...baseLectureRow,
        revision: baseLectureRow.revision + 1,
        videos,
      },
    ]);

    const { getLectureById } = await import("@/data/lecture/repository");
    const snapshot = await getLectureById({ lectureId });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.videos).toHaveLength(2);
    snapshot?.videos?.forEach((videoAsset, index) => {
      expect(videoAsset.id).toBe(`video-${runId}-${index}`);
    });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
