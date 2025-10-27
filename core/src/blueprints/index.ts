import type { GraphBlueprint } from '../types.js';
import { assemblySection } from './assembly.js';
import { audioSection } from './audio.js';
import { connectionsSection } from './connections.js';
import { imagesSection } from './images.js';
import { musicSection } from './music.js';
import { scriptSection } from './script.js';
import { videoFromImageSection } from './video-image.js';
import { videoFromTextSection } from './video-text.js';

export const generationSections = [
  scriptSection,
  musicSection,
  audioSection,
  imagesSection,
  videoFromTextSection,
  videoFromImageSection,
  assemblySection,
  connectionsSection,
];

export const generationBlueprint: GraphBlueprint = {
  sections: generationSections,
};

export * from './assembly.js';
export * from './audio.js';
export * from './connections.js';
export * from './images.js';
export * from './music.js';
export * from './script.js';
export * from './video-image.js';
export * from './video-text.js';
