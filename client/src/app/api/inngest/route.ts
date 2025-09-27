import { serve } from "inngest/next";
import { getInngestApp } from "@/inngest/client";
import { helloWorld } from "@/inngest/functions/helloworld";
import { startLectureCreation } from "@/inngest/functions/start-lecture-creation";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImagePrompts } from "@/inngest/functions/generate-segment-image-prompts";

const inngest = getInngestApp();

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    helloWorld,
    startLectureCreation,
    createLectureScript,
    generateSegmentImagePrompts,
  ],
});
