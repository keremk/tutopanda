import { serve } from "inngest/next";
import { getInngestApp } from "@/inngest/client";
import { helloWorld } from "@/inngest/functions/helloworld";
import { startLectureCreation } from "@/inngest/functions/start-lecture-creation";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImages } from "@/inngest/functions/generate-segment-images";
import { generateSegmentVideos } from "@/inngest/functions/generate-segment-videos";
import { generateNarration } from "@/inngest/functions/generate-narration";
import { generateMusic } from "@/inngest/functions/generate-music";
import { generateTimeline } from "@/inngest/functions/generate-timeline";
import { regenerateSingleImage } from "@/inngest/functions/regenerate-single-image";
import { regenerateSingleNarration } from "@/inngest/functions/regenerate-single-narration";
import { regenerateSingleMusic } from "@/inngest/functions/regenerate-single-music";
import { regenerateVideoStartingImage } from "@/inngest/functions/regenerate-video-starting-image";

const inngest = getInngestApp();

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    startLectureCreation,
    createLectureScript,
    generateSegmentImages,
    generateSegmentVideos,
    generateNarration,
    generateMusic,
    generateTimeline,
    regenerateSingleImage,
    regenerateSingleNarration,
    regenerateSingleMusic,
    regenerateVideoStartingImage,
  ],
});
