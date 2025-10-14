import type { LectureScript, MusicSettings } from "@/types/types";
import { generateMusicPrompt } from "@/services/media-generation/music/prompt-generator";
import {
  generateMusicsThrottled,
  type MusicGenerationRequest,
} from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";
import { DEFAULT_MUSIC_MODEL } from "@/lib/models";
import type { LectureAssetStorage } from "@/services/lecture/storage";

/**
 * Request for generating lecture music
 */
export type GenerateLectureMusicRequest = {
  script: LectureScript;
  durationSeconds: number;
  model?: string;
  runId: string;
};

/**
 * Context for music generation (where/who)
 */
export type MusicGenerationContext = {
  userId: string;
  projectId: number;
  lectureId: number;
};

/**
 * Dependencies for music orchestrator (injected for testability)
 */
export type MusicOrchestratorDeps = {
  generatePrompt?: typeof generateMusicPrompt;
  generateMusics?: typeof generateMusicsThrottled;
  assetStorage: LectureAssetStorage;
  logger?: Logger;
};

/**
 * Generate background music for a lecture.
 * Domain orchestrator that coordinates prompt generation, music generation, and storage.
 *
 * @param request - Lecture script and music config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Music asset with URL
 */
export async function generateLectureMusic(
  request: GenerateLectureMusicRequest,
  context: MusicGenerationContext,
  deps: MusicOrchestratorDeps
): Promise<MusicSettings> {
  const { script, durationSeconds, model = DEFAULT_MUSIC_MODEL, runId } = request;
  const {
    generatePrompt = generateMusicPrompt,
    generateMusics = generateMusicsThrottled,
    assetStorage,
    logger,
  } = deps;

  logger?.info("Starting lecture music generation", {
    durationSeconds,
    segmentCount: script.segments?.length || 0,
    model,
  });

  // Step 1: Generate music prompt
  const prompt = await generatePrompt(script, durationSeconds);

  logger?.info("Music prompt generated", {
    promptLength: prompt.length,
  });

  // Step 2: Generate music
  const [buffer] = await generateMusics(
    [
      {
        prompt,
        config: {
          durationSeconds,
          model,
        },
      },
    ],
    { logger }
  );

  // Step 3: Save music file
  const id = `music-${runId}`;
  const audioUrl = await assetStorage.saveMusic(buffer, id);

  logger?.info("Music saved", {
    id,
    path: audioUrl,
    bufferSize: buffer.length,
  });

  const musicAsset: MusicSettings = {
    id,
    label: "Background Score",
    prompt,
    duration: durationSeconds,
    audioUrl,
  };

  logger?.info("Lecture music generation complete", {
    id,
  });

  return musicAsset;
}

/**
 * Request for regenerating lecture music
 */
export type RegenerateMusicRequest = {
  prompt: string;
  durationSeconds: number;
  model?: string;
  musicId: string;
};

/**
 * Regenerate lecture music.
 * Used for UI-driven regeneration or agent-driven updates.
 *
 * @param request - Prompt and music config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Music asset with URL
 */
export async function regenerateMusic(
  request: RegenerateMusicRequest,
  _context: MusicGenerationContext,
  deps: MusicOrchestratorDeps
): Promise<MusicSettings> {
  const { prompt, durationSeconds, model = DEFAULT_MUSIC_MODEL, musicId } = request;
  const { generateMusics = generateMusicsThrottled, assetStorage, logger } = deps;

  logger?.info("Regenerating music", {
    musicId,
    durationSeconds,
    model,
  });

  // Generate music
  const [buffer] = await generateMusics(
    [
      {
        prompt,
        config: {
          durationSeconds,
          model,
        },
      },
    ],
    { logger }
  );

  // Save music file
  const audioUrl = await assetStorage.saveMusic(buffer, musicId);

  logger?.info("Music regenerated and saved", {
    musicId,
    path: audioUrl,
    bufferSize: buffer.length,
  });

  return {
    id: musicId,
    label: "Regenerated Music",
    prompt,
    duration: durationSeconds,
    audioUrl,
  };
}
