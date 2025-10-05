// Ken Burns effect presets and selection logic

export interface KenBurnsEffect {
  name: string;
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const kenBurnsEffects: Record<string, KenBurnsEffect> = {
  // Gentle effects for portraits and faces
  portraitZoomIn: {
    name: "portraitZoomIn",
    startScale: 1.0,
    endScale: 1.2,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },
  portraitZoomOut: {
    name: "portraitZoomOut",
    startScale: 1.2,
    endScale: 1.0,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },

  // Landscape and panoramic effects
  landscapePanLeft: {
    name: "landscapePanLeft",
    startScale: 1.1,
    endScale: 1.3,
    startX: 60,
    startY: 0,
    endX: -60,
    endY: 0,
  },
  landscapePanRight: {
    name: "landscapePanRight",
    startScale: 1.1,
    endScale: 1.3,
    startX: -60,
    startY: 0,
    endX: 60,
    endY: 0,
  },

  // Architecture and vertical composition
  architectureRise: {
    name: "architectureRise",
    startScale: 1.2,
    endScale: 1.0,
    startX: 0,
    startY: 50,
    endX: 0,
    endY: -50,
  },
  architectureDescend: {
    name: "architectureDescend",
    startScale: 1.0,
    endScale: 1.2,
    startX: 0,
    startY: -50,
    endX: 0,
    endY: 50,
  },

  // Dynamic and action effects
  dramaticZoomIn: {
    name: "dramaticZoomIn",
    startScale: 1.0,
    endScale: 1.5,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },
  dramaticZoomOut: {
    name: "dramaticZoomOut",
    startScale: 1.5,
    endScale: 1.0,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },

  // Combined zoom + pan effects
  zoomInPanLeft: {
    name: "zoomInPanLeft",
    startScale: 1.0,
    endScale: 1.3,
    startX: 50,
    startY: 0,
    endX: -30,
    endY: 0,
  },
  zoomInPanRight: {
    name: "zoomInPanRight",
    startScale: 1.0,
    endScale: 1.3,
    startX: -50,
    startY: 0,
    endX: 30,
    endY: 0,
  },
  zoomInPanUp: {
    name: "zoomInPanUp",
    startScale: 1.0,
    endScale: 1.3,
    startX: 0,
    startY: 40,
    endX: 0,
    endY: -30,
  },
  zoomInPanDown: {
    name: "zoomInPanDown",
    startScale: 1.0,
    endScale: 1.3,
    startX: 0,
    startY: -40,
    endX: 0,
    endY: 30,
  },

  // Diagonal movements
  diagonalZoomInUpRight: {
    name: "diagonalZoomInUpRight",
    startScale: 1.0,
    endScale: 1.3,
    startX: -40,
    startY: 40,
    endX: 30,
    endY: -30,
  },
  diagonalZoomInDownLeft: {
    name: "diagonalZoomInDownLeft",
    startScale: 1.0,
    endScale: 1.3,
    startX: 40,
    startY: -40,
    endX: -30,
    endY: 30,
  },

  // Subtle effects for technical content
  technicalSubtleZoom: {
    name: "technicalSubtleZoom",
    startScale: 1.0,
    endScale: 1.15,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  },
  technicalPanRight: {
    name: "technicalPanRight",
    startScale: 1.05,
    endScale: 1.15,
    startX: -30,
    startY: 0,
    endX: 30,
    endY: 0,
  },

  // Energetic variations
  energeticReveal: {
    name: "energeticReveal",
    startScale: 1.4,
    endScale: 1.0,
    startX: -50,
    startY: -50,
    endX: 40,
    endY: 40,
  },
};

// Content type detection from image prompts
export interface ContentAnalysis {
  type: "portrait" | "landscape" | "architecture" | "action" | "technical" | "general";
  mood: "calm" | "energetic" | "dramatic";
}

export function analyzeImageContent(prompt: string): ContentAnalysis {
  const lowerPrompt = prompt.toLowerCase();

  // Action/Dynamic detection - check BEFORE portrait to catch dynamic scenes with people
  if (
    lowerPrompt.includes("running") ||
    lowerPrompt.includes("flying") ||
    lowerPrompt.includes("moving") ||
    lowerPrompt.includes("racing") ||
    lowerPrompt.includes("jumping") ||
    lowerPrompt.includes("action") ||
    lowerPrompt.includes("dynamic") ||
    lowerPrompt.includes("explosion") ||
    lowerPrompt.includes("fast")
  ) {
    return { type: "action", mood: "energetic" };
  }

  // Technical/Diagram detection - check before portrait
  if (
    lowerPrompt.includes("diagram") ||
    lowerPrompt.includes("chart") ||
    lowerPrompt.includes("graph") ||
    lowerPrompt.includes("illustration") ||
    lowerPrompt.includes("infographic") ||
    lowerPrompt.includes("technical") ||
    lowerPrompt.includes("schematic")
  ) {
    return { type: "technical", mood: "calm" };
  }

  // Architecture detection
  if (
    lowerPrompt.includes("building") ||
    lowerPrompt.includes("architecture") ||
    lowerPrompt.includes("structure") ||
    lowerPrompt.includes("tower") ||
    lowerPrompt.includes("skyline") ||
    lowerPrompt.includes("monument")
  ) {
    return { type: "architecture", mood: "dramatic" };
  }

  // Landscape detection
  if (
    lowerPrompt.includes("landscape") ||
    lowerPrompt.includes("scenery") ||
    lowerPrompt.includes("view") ||
    lowerPrompt.includes("mountain") ||
    lowerPrompt.includes("ocean") ||
    lowerPrompt.includes("forest") ||
    lowerPrompt.includes("nature") ||
    lowerPrompt.includes("panorama") ||
    lowerPrompt.includes("vista")
  ) {
    return { type: "landscape", mood: "calm" };
  }

  // Portrait/Face detection - check LAST to avoid catching action scenes with people
  if (
    lowerPrompt.includes("person") ||
    lowerPrompt.includes("face") ||
    lowerPrompt.includes("portrait") ||
    lowerPrompt.includes("people") ||
    lowerPrompt.includes("student") ||
    lowerPrompt.includes("teacher") ||
    lowerPrompt.includes("character")
  ) {
    return { type: "portrait", mood: "calm" };
  }

  return { type: "general", mood: "calm" };
}

// Select appropriate Ken Burns effect based on content and variety
export function selectKenBurnsEffect(
  imagePrompt: string,
  previousEffectName?: string
): KenBurnsEffect {
  const analysis = analyzeImageContent(imagePrompt);
  let candidateEffects: KenBurnsEffect[] = [];

  // Select effect pool based on content type
  switch (analysis.type) {
    case "portrait":
      candidateEffects = [
        kenBurnsEffects.portraitZoomIn,
        kenBurnsEffects.portraitZoomOut,
      ];
      break;

    case "landscape":
      candidateEffects = [
        kenBurnsEffects.landscapePanLeft,
        kenBurnsEffects.landscapePanRight,
        kenBurnsEffects.zoomInPanLeft,
        kenBurnsEffects.zoomInPanRight,
      ];
      break;

    case "architecture":
      candidateEffects = [
        kenBurnsEffects.architectureRise,
        kenBurnsEffects.architectureDescend,
        kenBurnsEffects.zoomInPanUp,
        kenBurnsEffects.zoomInPanDown,
      ];
      break;

    case "action":
      candidateEffects = [
        kenBurnsEffects.dramaticZoomIn,
        kenBurnsEffects.dramaticZoomOut,
        kenBurnsEffects.energeticReveal,
        kenBurnsEffects.diagonalZoomInUpRight,
        kenBurnsEffects.diagonalZoomInDownLeft,
      ];
      break;

    case "technical":
      candidateEffects = [
        kenBurnsEffects.technicalSubtleZoom,
        kenBurnsEffects.technicalPanRight,
      ];
      break;

    case "general":
    default:
      candidateEffects = [
        kenBurnsEffects.zoomInPanLeft,
        kenBurnsEffects.zoomInPanRight,
        kenBurnsEffects.zoomInPanUp,
        kenBurnsEffects.zoomInPanDown,
        kenBurnsEffects.diagonalZoomInUpRight,
        kenBurnsEffects.diagonalZoomInDownLeft,
      ];
      break;
  }

  // Filter out the previous effect to ensure variety
  if (previousEffectName) {
    candidateEffects = candidateEffects.filter(
      (effect) => effect.name !== previousEffectName
    );
  }

  // If we filtered out all effects, use the full pool
  if (candidateEffects.length === 0) {
    candidateEffects = Object.values(kenBurnsEffects);
  }

  // Select a random effect from candidates
  const selectedEffect =
    candidateEffects[Math.floor(Math.random() * candidateEffects.length)];

  return selectedEffect;
}
