import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { AssetMap, TimelineDocument } from "../../types/timeline.js";
import { DOCUMENTARY_COMPOSITION_ID } from "../../remotion/documentary-root.js";

export interface DocumentaryMp4RenderOptions {
  timeline: TimelineDocument;
  assets: AssetMap;
  outputFile: string;
  width?: number;
  height?: number;
  fps?: number;
  compositionId?: string;
  concurrency?: number;
  browserExecutable?: string;
}

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

const DIST_ROOT = path.dirname(fileURLToPath(new URL("../../renderers/documentary/render-mp4.js", import.meta.url)));
const ENTRY_POINT = path.resolve(DIST_ROOT, "../../remotion/entry.js");

function resolveBrowserExecutable(): string | undefined {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) {
    return process.env.REMOTION_BROWSER_EXECUTABLE;
  }
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ];
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs") as typeof import("fs");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return undefined;
}

export async function renderDocumentaryMp4(options: DocumentaryMp4RenderOptions): Promise<string> {
  const { timeline, assets, outputFile } = options;
  if (!timeline) {
    throw new Error("renderDocumentaryMp4 requires a timeline.");
  }

  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fps = options.fps ?? DEFAULT_FPS;
  const compositionId = options.compositionId ?? DOCUMENTARY_COMPOSITION_ID;

  await mkdir(path.dirname(outputFile), { recursive: true });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "tutopanda-compositions-"));
  const bundleOutDir = path.join(tempDir, "bundle");

  const inputProps = {
    timeline,
    assets,
    width,
    height,
    fps,
  } satisfies DocumentaryCompositionPropsWithMeta;
  const browserExecutable = options.browserExecutable ?? resolveBrowserExecutable();
  if (!browserExecutable) {
    throw new Error(
      "No browser executable found. Set REMOTION_BROWSER_EXECUTABLE (or CHROME_PATH) to a Linux/macOS Chrome/Chromium binary."
    );
  }
  // Force Remotion to use the resolved browser instead of downloading headless shell.
  process.env.REMOTION_BROWSER_EXECUTABLE = browserExecutable;
  console.info("[remotion] using browser executable:", browserExecutable);

  let bundleLocation: string | null = null;
  try {
    bundleLocation = await bundle(ENTRY_POINT, undefined, {
      outDir: bundleOutDir,
      enableCaching: true,
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: compositionId,
      inputProps,
      browserExecutable,
      chromiumOptions: {
        executablePath: browserExecutable,
        args: ["--no-sandbox", "--disable-gpu"],
      } as never,
    });

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: outputFile,
      concurrency: options.concurrency,
      browserExecutable,
      // Some environments ignore browserExecutable unless also set via chromiumOptions.
      chromiumOptions: {
        executablePath: browserExecutable,
        args: ["--no-sandbox", "--disable-gpu"],
      } as never,
      // OffthreadVideo is used; ensure timeout gives renderer enough room.
      timeoutInMilliseconds: 5 * 60 * 1000,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  return outputFile;
}

interface DocumentaryCompositionPropsWithMeta {
  timeline: TimelineDocument;
  assets: AssetMap;
  width: number;
  height: number;
  fps: number;
}
