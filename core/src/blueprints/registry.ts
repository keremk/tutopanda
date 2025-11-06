import type { BlueprintSection } from '../types.js';
import { scriptSection } from './script.js';
import { musicSection } from './music.js';
import { audioSection } from './audio.js';
import { imagesSection } from './images.js';
import { videoFromTextSection } from './video-text.js';
import { videoFromImageSection } from './video-image.js';
import { assemblySection } from './assembly.js';

const registry = new Map<string, BlueprintSection>([
  ['script', scriptSection],
  ['music', musicSection],
  ['audio', audioSection],
  ['images', imagesSection],
  ['videoFromText', videoFromTextSection],
  ['videoFromImage', videoFromImageSection],
  ['assembly', assemblySection],
]);

export function getSectionById(id: string): BlueprintSection | undefined {
  return registry.get(id);
}

export function listSections(): BlueprintSection[] {
  return Array.from(registry.values());
}

export function getAllSectionIds(): string[] {
  return Array.from(registry.keys());
}
