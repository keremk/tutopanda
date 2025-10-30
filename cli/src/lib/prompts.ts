import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

export interface PromptMap {
  inquiry?: string;
  image?: Record<string, string>;
  video?: Record<string, string>;
  music?: Record<string, string>;
}

export async function writePromptFile(baseDir: string, relativePath: string, contents: string): Promise<string> {
  const targetPath = resolve(baseDir, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents, 'utf8');
  return targetPath;
}

export async function readPromptFile(baseDir: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(resolve(baseDir, relativePath), 'utf8');
  } catch {
    return null;
  }
}

export function promptsToToml(prompts: PromptMap): string {
  const data: Record<string, any> = { prompts: {} };
  if (prompts.inquiry !== undefined) {
    data.prompts.inquiry = prompts.inquiry;
  }
  if (prompts.image) {
    data.prompts.image = prompts.image;
  }
  if (prompts.video) {
    data.prompts.video = prompts.video;
  }
  if (prompts.music) {
    data.prompts.music = prompts.music;
  }
  return stringifyToml(data).trimEnd();
}

export function parsePromptsToml(contents: string): PromptMap {
  const parsed = parseToml(contents) as Record<string, any>;
  const prompts = parsed.prompts ?? {};
  const result: PromptMap = {};
  if (typeof prompts.inquiry === 'string') {
    result.inquiry = prompts.inquiry;
  }
  if (typeof prompts.image === 'object') {
    result.image = normalizeRecord(prompts.image);
  }
  if (typeof prompts.video === 'object') {
    result.video = normalizeRecord(prompts.video);
  }
  if (typeof prompts.music === 'object') {
    result.music = normalizeRecord(prompts.music);
  }
  return result;
}

function normalizeRecord(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}
