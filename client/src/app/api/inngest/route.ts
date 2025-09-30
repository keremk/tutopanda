import { serve } from "inngest/next";
import { getInngestApp } from "@/inngest/client";
import { helloWorld } from "@/inngest/functions/helloworld";
import { startLectureCreation } from "@/inngest/functions/start-lecture-creation";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImagePrompts } from "@/inngest/functions/generate-segment-image-prompts";
import { generateImages } from "@/inngest/functions/generate-images";
import { generateNarration } from "@/inngest/functions/generate-narration";
import { generateMusic } from "@/inngest/functions/generate-music";
import { generateTimeline } from "@/inngest/functions/generate-timeline";

const inngest = getInngestApp();

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    startLectureCreation,
    createLectureScript,
    generateSegmentImagePrompts,
    generateImages,
    generateNarration,
    generateMusic, 
    generateTimeline
  ],
});
