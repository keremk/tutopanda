import { imageStyleValues } from "@/types/types";

export type ImageStyleValue = (typeof imageStyleValues)[number];

export type ImageStyleMetadata = {
  value: ImageStyleValue;
  label: string;
  description: string;
  promptSnippet: string;
};

const IMAGE_STYLE_CATALOG: Record<ImageStyleValue, ImageStyleMetadata> = {
  Ghibli: {
    value: "Ghibli",
    label: "Studio Ghibli",
    description:
      "Hand-painted fantasy worlds with diffused light, soft shading, and gentle motion that feel cinematic yet intimate.",
    promptSnippet: `Illustrate the scene as a Studio Ghibli animation with painterly backgrounds, glowing ambient light, and expressive characters captured mid-moment.`,
  },
  Pixar: {
    value: "Pixar",
    label: "Pixar CG",
    description:
      "Polished 3D rendering with cinematic depth of field, saturated color palettes, and emotionally readable character poses.",
    promptSnippet: `Render with Pixar-level cinematic 3D lighting, crisp details, and vibrant colors that highlight the emotional beat of the moment.`,
  },
  Anime: {
    value: "Anime",
    label: "Anime",
    description:
      "Bold line work, dynamic poses, and dramatic lighting inspired by modern anime series and films.",
    promptSnippet: `Deliver a modern anime illustration with decisive line art, dynamic composition, and stylized lighting that heightens the drama.`,
  },
  Watercolor: {
    value: "Watercolor",
    label: "Watercolor",
    description:
      "Organic watercolor textures with layered pigments, soft gradients, and subtle paper grain.",
    promptSnippet: `Paint in delicate watercolor washes with layered pigments, gentle gradients, and visible paper texture for an artisanal feel.`,
  },
  Cartoon: {
    value: "Cartoon",
    label: "Cartoon",
    description:
      "Playful 2D illustration with simplified shapes, bold outlines, and exaggerated expressions.",
    promptSnippet: `Create a lively 2D cartoon illustration with bold outlines, simplified shapes, and exaggerated expressions that read instantly.`,
  },
  Photorealistic: {
    value: "Photorealistic",
    label: "Photorealistic",
    description:
      "High fidelity photography aesthetic with cinematic lighting, realistic textures, and accurate materials.",
    promptSnippet: `Produce a photorealistic cinematic shot with accurate materials, dramatic lighting, and lifelike depth of field.`,
  },
};

export const imageStyleMetadata = IMAGE_STYLE_CATALOG;

export function getImageStyleMetadata(style?: ImageStyleValue | null) {
  if (!style) {
    return null;
  }
  return IMAGE_STYLE_CATALOG[style] ?? null;
}

export function listImageStyles() {
  return imageStyleValues.map((value) => IMAGE_STYLE_CATALOG[value]);
}

export function buildStyledImagePrompt({
  basePrompt,
  style,
}: {
  basePrompt: string;
  style?: ImageStyleValue | null;
}) {
  const trimmedPrompt = basePrompt.trim();
  const metadata = getImageStyleMetadata(style);

  if (!metadata?.promptSnippet) {
    return trimmedPrompt;
  }

  return `${trimmedPrompt}\n\n${metadata.promptSnippet}`.trim();
}
