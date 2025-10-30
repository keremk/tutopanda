import { z } from 'zod';
import { InputValuesSchema } from './input-values.js';

export const StorageLocationInputSchema = z.object({
  root: z.string().min(1).optional(),
  basePath: z.string().min(1).optional(),
});

export type StorageLocationInput = z.infer<typeof StorageLocationInputSchema>;

const BooleanArray = z.array(z.boolean()).min(1);

export const BlueprintConfigSchema = z.object({
  segmentCount: z.number().int().positive(),
  imagesPerSegment: z.number().int().nonnegative(),
  useVideo: z.union([z.boolean(), BooleanArray]),
  isImageToVideo: z.union([z.boolean(), BooleanArray]),
});

export type BlueprintConfig = z.infer<typeof BlueprintConfigSchema>;

export const BuildPlanConfigSchema = z.object({
  storage: StorageLocationInputSchema.optional(),
  blueprint: BlueprintConfigSchema,
  inputs: InputValuesSchema,
});

export type BuildPlanConfig = z.infer<typeof BuildPlanConfigSchema>;

export function parseBuildPlanConfig(raw: unknown): BuildPlanConfig {
  return BuildPlanConfigSchema.parse(raw);
}
