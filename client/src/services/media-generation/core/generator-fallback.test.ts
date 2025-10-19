import { describe, it, expect } from "vitest";
import { generateImage } from "@/services/media-generation/image/image-generator";
import { generateAudio } from "@/services/media-generation/audio/audio-generator";
import { generateMusic } from "@/services/media-generation/music/music-generator";
import { generateVideo } from "@/services/media-generation/video/video-generator";
import { isMediaGenerationError } from "@/services/media-generation/core";

describe("generator fallback error wrapping", () => {
  it("wraps unexpected errors in generateImage", async () => {
    const provider = {
      name: "test-image",
      supportedModels: ["test-model"],
      async generateImage() {
        throw new Error("boom");
      },
    };

    try {
      await generateImage(
        "prompt",
        { model: "test-model" },
        { provider }
      );
      throw new Error("expected failure");
    } catch (error) {
      expect(isMediaGenerationError(error)).toBe(true);
      if (isMediaGenerationError(error)) {
        expect(error.code).toBe("UNKNOWN");
      }
    }
  });

  it("wraps unexpected errors in generateAudio", async () => {
    const provider = {
      name: "test-audio",
      supportedModels: ["audio-model"],
      async generateAudio() {
        throw new Error("boom");
      },
    };

    await expect(
      generateAudio(
        "sample text",
        { voice: "voice", model: "audio-model" },
        { provider }
      )
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("wraps unexpected errors in generateMusic", async () => {
    const provider = {
      name: "test-music",
      supportedModels: ["music-model"],
      async generateMusic() {
        throw new Error("boom");
      },
    };

    await expect(
      generateMusic(
        "prompt",
        { durationSeconds: 30, model: "music-model" },
        { provider }
      )
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });

  it("wraps unexpected errors in generateVideo", async () => {
    const provider = {
      name: "test-video",
      supportedModels: ["video-model"],
      async generateVideo() {
        throw new Error("boom");
      },
    };

    await expect(
      generateVideo(
        "prompt",
        Buffer.from("image"),
        {
          aspectRatio: "16:9",
          resolution: "480p",
          duration: "10",
          model: "video-model",
        },
        { provider }
      )
    ).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});
