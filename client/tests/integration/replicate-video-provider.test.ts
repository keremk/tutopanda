import { describe, expect, test } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

import { ReplicateVideoProvider } from "@/services/media-generation/video";
import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from "@/lib/models";
import { videoResolutionValues } from "@/types/types";

const envPaths = [".env.local", ".env"].map((file) => resolve(process.cwd(), file)).filter((path) => existsSync(path));
for (const envPath of envPaths) {
  loadEnv({ path: envPath, override: false });
}

const FIXTURE_DIR = resolve(process.cwd(), "tests", "integration", "test-data");
const TEST_OUTPUT_DIR = resolve(process.cwd(), "tests", "integration", "test-output");
const SEED_IMAGE_FILENAME = process.env.REPLICATE_TEST_IMAGE ?? "seed-image.jpg";
const SEED_IMAGE_PATH = resolve(FIXTURE_DIR, SEED_IMAGE_FILENAME);

const DEFAULT_PROMPT = `
Style: Polished 3D rendering with cinematic depth of field, saturated color palettes, and emotionally readable character poses.

Mood: Quiet, intimate, documentary realism—a small, cinematic moment of astonishment and discovery. Muted, slightly desaturated palette with warm lamp highlights and light film grain; authentic 1920s props and costumes; no modern objects.
[cut] Extreme close-up macro of the Petri dish: slow clockwise micro-pan across the dish surface to reveal the fuzzy mold and the pristine clear halo where bacteria are absent. Very shallow depth of field so the rim of the dish and textured mold are crisply rendered, background a soft blur. Lamp highlights and dust motes visible; camera movement is minimal and deliberate.
[cut] Rack-focus from the rim of the dish to the blurred figure of the bacteriologist in the background. As focus shifts, a slow dolly-in toward the scientist’s gloved fingers hovering near the dish; capture a tiny, involuntary gesture of pointing. Maintain naturalistic handheld subtlety to add intimacy.
[cut] Medium close-up on the scientist’s face: warm, directional desk-lamp lighting sculpts features; eyes widen with a mix of surprise and curiosity. Slow push-in to the eyes, very slight handheld sway to sell real-time reaction. Keep background lab clutter softly out of focus.
[cut] Quick pull back to a wider shot of the cluttered bench: microscope, glass reagent bottles, Bunsen burner, stacked culture plates and open notebook. The Petri dish remains in the foreground with the clear halo prominent; the scientist is now slightly out of frame but visible leaning over the bench. Hold for a beat on the halo, then gentle fade or cut to the next segment.
`;
const OUTPUT_PATH = process.env.REPLICATE_TEST_OUTPUT ?? resolve(TEST_OUTPUT_DIR, "replicate-test-output.mp4");
const SHOULD_SAVE_OUTPUT = process.env.SAVE_REPLICATE_TEST_OUTPUT === "true";

const replicateApiToken = process.env.REPLICATE_API_TOKEN;

function shouldSkip(): boolean {
  if (!replicateApiToken) {
    console.warn("[replicate-video-provider.test] Skipping: REPLICATE_API_TOKEN is not set.");
    return true;
  }

  return false;
}

async function ensureSeedImage(): Promise<boolean> {
  try {
    await readFile(SEED_IMAGE_PATH);
    return true;
  } catch {
    console.warn(
      `[replicate-video-provider.test] Skipping: seed image "${SEED_IMAGE_FILENAME}" not found in ${FIXTURE_DIR}.`
    );
    return false;
  }
}

describe("ReplicateVideoProvider integration", () => {
  test(
    "generates a video from the sample prompt and seed image",
    {
      timeout: Number(process.env.REPLICATE_TEST_TIMEOUT ?? 60_000),
    },
    async () => {
      if (shouldSkip()) {
        return;
      }

      if (!(await ensureSeedImage())) {
        return;
      }

      const provider = new ReplicateVideoProvider(replicateApiToken);

      console.info(
        "[replicate-video-provider.test] Starting generation with model",
        VIDEO_MODELS.BYTEDANCE_SEEDANCE_1_LITE
      );

      const startingImage = await readFile(SEED_IMAGE_PATH);

      const videoBuffer = await provider.generateVideo({
        prompt: DEFAULT_PROMPT,
        startingImage,
        aspectRatio: "16:9",
        resolution: videoResolutionValues[0], // "480p"
        duration: 5, // This needs to be number not string
        model: DEFAULT_VIDEO_MODEL,
      });

      expect(videoBuffer.byteLength).toBeGreaterThan(0);

      console.info(
        "[replicate-video-provider.test] Video generated successfully. Bytes:",
        videoBuffer.byteLength
      );

      if (SHOULD_SAVE_OUTPUT) {
        await writeFile(OUTPUT_PATH, videoBuffer);
        console.info("[replicate-video-provider.test] Saved test output to", OUTPUT_PATH);
      }
    }
  );
});
