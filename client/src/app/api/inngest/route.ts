import { serve } from "inngest/next";
import { getInngestApp } from "@/inngest/client";
import { helloWorld } from "@/inngest/functions/helloworld";
import { startLectureCreation } from "@/inngest/functions/start-lecture-creation";

const inngest = getInngestApp();

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [helloWorld, startLectureCreation],
});
