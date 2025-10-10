import type { LectureScript, MusicSettings } from "@/types/types";
import { generateMusicPrompt } from "@/services/media-generation/music/prompt-generator";
import {
  generateMusicsThrottled,
  type MusicGenerationRequest,
} from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";
import { DEFAULT_MUSIC_MODEL } from "@/lib/models";

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
};

/**
 * Dependencies for music orchestrator (injected for testability)
 */
export type MusicOrchestratorDeps = {
  generatePrompt?: typeof generateMusicPrompt;
  generateMusics?: typeof generateMusicsThrottled;
  saveFile: (buffer: Buffer, path: string) => Promise<void>;
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
  const { userId, projectId } = context;
  const {
    generatePrompt = generateMusicPrompt,
    generateMusics = generateMusicsThrottled,
    saveFile,
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
  const relativePath = `musical-score/${id}.mp3`;
  const audioUrl = `${userId}/${projectId}/${relativePath}`;
  const fullPath = audioUrl;
  await saveFile(buffer, fullPath);

  logger?.info("Music saved", {
    id,
    path: fullPath,
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
  context: MusicGenerationContext,
  deps: MusicOrchestratorDeps
): Promise<MusicSettings> {
  const { prompt, durationSeconds, model = DEFAULT_MUSIC_MODEL, musicId } = request;
  const { userId, projectId } = context;
  const { generateMusics = generateMusicsThrottled, saveFile, logger } = deps;

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
  const relativePath = `musical-score/${musicId}.mp3`;
  const audioUrl = `${userId}/${projectId}/${relativePath}`;
  const fullPath = audioUrl;
  await saveFile(buffer, fullPath);

  logger?.info("Music regenerated and saved", {
    musicId,
    path: fullPath,
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
