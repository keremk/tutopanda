import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CreateInputsFileOptions {
  root: string;
  prompt: string;
  fileName?: string;
  overrides?: Record<string, string | number>;
}

const DEFAULT_INPUT_VALUES: Record<string, string | number> = {
  Duration: 60,
  NumOfSegments: 3,
  NumOfImagesPerNarrative: 1,
  ImageStyle: 'cinematic',
  Audience: 'Adult',
  VoiceId: 'default-voice',
  Language: 'en',
};

export async function createInputsFile(options: CreateInputsFileOptions): Promise<string> {
  const { root, prompt, fileName = 'inputs.toml', overrides } = options;
  const values: Record<string, string | number> = {
    InquiryPrompt: prompt,
    ...DEFAULT_INPUT_VALUES,
    ...(overrides ?? {}),
  };

  const contents = [
    '[inputs]',
    ...Object.entries(values).map(([key, value]) => `${key} = ${formatTomlValue(value)}`),
  ].join('\n');

  const filePath = join(root, fileName);
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}

function formatTomlValue(value: string | number): string {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `${value}`;
}
