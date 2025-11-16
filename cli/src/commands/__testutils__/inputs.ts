import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INPUT_FILE_NAME } from '../../lib/input-files.js';

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
  const { root, prompt, fileName = INPUT_FILE_NAME, overrides } = options;
  const values: Record<string, string | number> = {
    InquiryPrompt: prompt,
    ...DEFAULT_INPUT_VALUES,
    ...(overrides ?? {}),
  };

  const contents = [
    'inputs:',
    ...Object.entries(values).map(([key, value]) => `  ${key}: ${formatYamlValue(value)}`),
  ].join('\n');

  const filePath = join(root, fileName);
  await writeFile(filePath, contents, 'utf8');
  return filePath;
}

function formatYamlValue(value: string | number): string {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `${value}`;
}
