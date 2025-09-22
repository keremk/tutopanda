import { channel, topic } from "@inngest/realtime";

import { getInngestApp } from "@/inngest/client";

export type LectureProgressMessage = {
  runId: string;
  message: string;
  status: "in-progress" | "complete";
  step: number;
  totalSteps: number;
  timestamp: string;
};

export type LectureCreationEventData = {
  prompt: string;
  userId: string;
  runId: string;
};

export const lectureProgressChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(topic("progress").type<LectureProgressMessage>());

const inngest = getInngestApp();

export const startLectureCreation = inngest.createFunction(
  { id: "start-lecture-creation" },
  { event: "app/start-lecture-creation" },
  async ({ event, publish }) => {
    const { userId, prompt, runId } = event.data as LectureCreationEventData;

    const updates = [
      `Received prompt: ${prompt}`,
      "Searching for historical information",
      "Creating a synopsis",
      "Drafting detailed lecture outline",
      "Finalizing learner handouts",
    ];

    for (const [index, text] of updates.entries()) {
      await publish(
        lectureProgressChannel(userId).progress({
          runId,
          message: text,
          status: index === updates.length - 1 ? "complete" : "in-progress",
          step: index + 1,
          totalSteps: updates.length,
          timestamp: new Date().toISOString(),
        })
      );
    }

    return { runId };
  }
);
