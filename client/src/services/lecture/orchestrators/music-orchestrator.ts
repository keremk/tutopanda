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
  const outcomes = await generateMusics(
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
  const [outcome] = outcomes;
  const id = `music-${runId}`;
  const baseAsset: MusicSettings = {
    id,
    label: "Background Score",
    prompt,
    duration: durationSeconds,
  };

  if (outcome && outcome.ok) {
    const audioUrl = await assetStorage.saveMusic(outcome.buffer, id);

    logger?.info("Music saved", {
      id,
      path: audioUrl,
      bufferSize: outcome.buffer.length,
    });

    const musicAsset: MusicSettings = {
      ...baseAsset,
      audioUrl,
      status: "generated",
    };

    logger?.info("Lecture music generation complete", {
      id,
    });

    return musicAsset;
  }

  const error = outcome?.error;

  if (error) {
    logger?.warn?.("Music generation flagged", {
      id,
      code: error.code,
      message: error.message,
      providerCode: error.providerCode,
    });

    return {
      ...baseAsset,
      status: error.userActionRequired ? "needs_prompt_update" : "failed",
      error: {
        code: error.code,
        message: error.message,
        provider: error.provider,
        providerCode: error.providerCode,
      },
    } as MusicSettings;
  }

  logger?.error("Music generation returned no result", { id });

  return {
    ...baseAsset,
    status: "failed",
    error: {
      code: "UNKNOWN",
      message: "Music generation returned no result",
    },
  } as MusicSettings;
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
  const [outcome] = await generateMusics(
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

  if (!outcome) {
    throw new Error("No music generation result received for regeneration");
  }

  const baseAsset: MusicSettings = {
    id: musicId,
    label: "Regenerated Music",
    prompt,
    duration: durationSeconds,
  };

  if (outcome.ok) {
    const audioUrl = await assetStorage.saveMusic(outcome.buffer, musicId);

    logger?.info("Music regenerated and saved", {
      musicId,
      path: audioUrl,
      bufferSize: outcome.buffer.length,
    });

    return {
      ...baseAsset,
      audioUrl,
      status: "generated",
    } as MusicSettings;
  }

  const error = outcome.error;

  logger?.warn?.("Music regeneration flagged", {
    musicId,
    code: error.code,
    message: error.message,
    providerCode: error.providerCode,
  });

  return {
    ...baseAsset,
    status: error.userActionRequired ? "needs_prompt_update" : "failed",
    error: {
      code: error.code,
      message: error.message,
      provider: error.provider,
      providerCode: error.providerCode,
    },
  } as MusicSettings;
}
