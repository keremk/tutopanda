import type { Timeline } from "@/types/timeline";

export const sampleTimeline: Timeline = {
  id: "timeline-demo",
  name: "Exploring Mountaintop Stories",
  duration: 55,
  tracks: {
    visual: [
      {
        id: "visual-1",
        kind: "kenBurns",
        name: "Summit Sunrise",
        startTime: 0,
        duration: 10,
      },
      {
        id: "visual-2",
        kind: "video",
        name: "Aerial Sweep",
        startTime: 10.5,
        duration: 12,
      },
      {
        id: "visual-3",
        kind: "kenBurns",
        name: "Ridge Walk",
        startTime: 23.2,
        duration: 9,
      },
      {
        id: "visual-4",
        kind: "kenBurns",
        name: "Golden Hour",
        startTime: 35.5,
        duration: 8,
      },
    ],
    voice: [
      {
        id: "voice-1",
        kind: "voice",
        name: "Narration Intro",
        startTime: 0.5,
        duration: 12,
      },
      {
        id: "voice-2",
        kind: "voice",
        name: "History Spotlight",
        startTime: 14.5,
        duration: 9,
      },
      {
        id: "voice-3",
        kind: "voice",
        name: "Guide Anecdote",
        startTime: 26.1,
        duration: 8,
      },
    ],
    music: [
      {
        id: "music-1",
        kind: "music",
        name: "Ambient Pad",
        startTime: 0,
        duration: 22,
      },
      {
        id: "music-2",
        kind: "music",
        name: "Uplift Motif",
        startTime: 22.5,
        duration: 20,
      },
    ],
    soundEffects: [
      {
        id: "fx-1",
        kind: "soundEffect",
        name: "Wind Chimes",
        startTime: 5,
        duration: 5,
      },
      {
        id: "fx-2",
        kind: "soundEffect",
        name: "Footstep Crunch",
        startTime: 28,
        duration: 4,
      },
    ],
  },
};
