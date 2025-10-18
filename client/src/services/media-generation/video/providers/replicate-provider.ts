import Replicate from "replicate";
import type { VideoProvider, VideoGenerationParams } from "../types";
import { videoModelValues, DEFAULT_VIDEO_MODEL } from "@/lib/models";

/**
 * Replicate video generation provider.
 * Supports models like bytedance/seedance-1-lite.
 */
export class ReplicateVideoProvider implements VideoProvider {
  name = "replicate";
  supportedModels = [...videoModelValues];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateVideo(params: VideoGenerationParams): Promise<Buffer> {
    const { prompt, startingImage, aspectRatio, resolution, duration, model = DEFAULT_VIDEO_MODEL } = params;

    // Convert buffer to base64 for Replicate API
    const imageBase64 = `data:image/jpeg;base64,${startingImage.toString('base64')}`;

    const input = {
      prompt,
      image: imageBase64,
      duration,
      aspect_ratio: aspectRatio || "16:9",
      resolution: resolution || "480p",
    };

    const output = (await this.replicate.run(model as `${string}/${string}`, {
      input,
    })) as unknown;

    const videoBuffer = await this.resolveVideoOutput(output);

    if (!videoBuffer) {
      throw new Error(`Video generation failed for prompt: ${prompt.substring(0, 50)}...`);
    }

    return videoBuffer;
  }

  private async resolveVideoOutput(output: unknown): Promise<Buffer | null> {
    if (!output) {
      return null;
    }

    if (typeof output === "string") {
      return this.downloadVideo(output);
    }

    if (output instanceof Uint8Array) {
      return Buffer.from(output);
    }

    if (output instanceof ArrayBuffer) {
      return Buffer.from(output);
    }

    if (typeof Blob !== "undefined" && output instanceof Blob) {
      const arrayBuffer = await output.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if (Array.isArray(output)) {
      for (const item of output) {
        const resolved = await this.resolveVideoOutput(item);
        if (resolved) {
          return resolved;
        }
      }
      return null;
    }

    if (typeof output === "object") {
      const record = output as Record<string, unknown>;

      if ("output" in record) {
        const resolved = await this.resolveVideoOutput(record.output);
        if (resolved) {
          return resolved;
        }
      }

      if (typeof (record as { url?: unknown }).url === "function") {
        try {
          const urlResult = (record as { url: () => URL | string | Promise<URL | string> }).url();
          const awaited = urlResult instanceof Promise ? await urlResult : urlResult;
          const urlString = awaited instanceof URL ? awaited.toString() : awaited;
          if (typeof urlString === "string") {
            return this.downloadVideo(urlString);
          }
        } catch {
          // Ignore and continue trying other strategies
        }
      }

      if (typeof (record as { href?: unknown }).href === "string") {
        return this.downloadVideo((record as { href: string }).href);
      }

      if (typeof (record as { toString?: () => unknown }).toString === "function") {
        const stringValue = (record as { toString: () => unknown }).toString();
        if (typeof stringValue === "string" && stringValue.startsWith("http")) {
          return this.downloadVideo(stringValue);
        }
      }

      const streamLike = record as { getReader?: () => unknown };
      if (typeof streamLike.getReader === "function") {
        const reader = streamLike.getReader() as {
          read: () => Promise<{ done: boolean; value?: Uint8Array }>;
        };
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
          }
        }

        return chunks.length > 0 ? Buffer.concat(chunks) : null;
      }
    }

    return null;
  }

  private async downloadVideo(videoUrl: string): Promise<Buffer> {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
