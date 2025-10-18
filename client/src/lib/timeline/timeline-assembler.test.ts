import { describe, it, expect } from "vitest";
import type { ImageAsset, NarrationSettings, MusicSettings, VideoAsset } from "@/types/types";
import {
  groupImagesBySegment,
  buildVisualTrack,
  buildVoiceTrack,
  buildMusicTrack,
  calculateTotalDuration,
  assembleTimeline,
} from "./timeline-assembler";

describe("groupImagesBySegment", () => {
  it("groups images by segment index from ID", () => {
    const images: ImageAsset[] = [
      {
        id: "img-run123-0-0",
        label: "Segment 1 Image 1",
        prompt: "test prompt 1",
      },
      {
        id: "img-run123-0-1",
        label: "Segment 1 Image 2",
        prompt: "test prompt 2",
      },
      {
        id: "img-run123-1-0",
        label: "Segment 2 Image 1",
        prompt: "test prompt 3",
      },
    ];

    const grouped = groupImagesBySegment(images);

    expect(grouped.size).toBe(2);
    expect(grouped.get(0)?.length).toBe(2);
    expect(grouped.get(1)?.length).toBe(1);
  });

  it("handles single segment", () => {
    const images: ImageAsset[] = [
      {
        id: "img-run123-0-0",
        label: "Segment 1",
        prompt: "test prompt",
      },
    ];

    const grouped = groupImagesBySegment(images);

    expect(grouped.size).toBe(1);
    expect(grouped.get(0)?.length).toBe(1);
  });

  it("handles empty images array", () => {
    const grouped = groupImagesBySegment([]);
    expect(grouped.size).toBe(0);
  });

  it("defaults to segment 0 for malformed IDs", () => {
    const images: ImageAsset[] = [
      {
        id: "invalid-id",
        label: "Bad ID",
        prompt: "test prompt",
      },
    ];

    const grouped = groupImagesBySegment(images);
    expect(grouped.get(0)?.length).toBe(1);
  });
});

describe("buildVisualTrack", () => {
  it("creates visual clips from images and narration", () => {
    const imagesBySegment = new Map<number, ImageAsset[]>([
      [
        0,
        [
          {
            id: "img-run123-0-0",
            label: "Segment 1",
            prompt: "portrait of a person",
            sourceUrl: "images/test.jpg",
          },
        ],
      ],
    ]);
    const videosBySegment = new Map<number, VideoAsset>();

    const narration: NarrationSettings[] = [
      {
        id: "narr-0",
        label: "Narration 1",
        duration: 10,
        sourceUrl: "audio/test.mp3",
      },
    ];

    const segmentDurations = narration.map((n) => n.duration ?? 1);
    const track = buildVisualTrack(
      imagesBySegment,
      videosBySegment,
      narration,
      segmentDurations
    );

    expect(track.length).toBe(1);
    expect(track[0].duration).toBe(10);
    expect(track[0].startTime).toBe(0);
    expect(track[0].kind).toBe("kenBurns");
  });

  it("distributes duration evenly across multiple images per segment", () => {
    const imagesBySegment = new Map<number, ImageAsset[]>([
      [
        0,
        [
          {
            id: "img-run123-0-0",
            label: "Image 1",
            prompt: "test 1",
            sourceUrl: "img1.jpg",
          },
          {
            id: "img-run123-0-1",
            label: "Image 2",
            prompt: "test 2",
            sourceUrl: "img2.jpg",
          },
        ],
      ],
    ]);
    const videosBySegment = new Map<number, VideoAsset>();

    const narration: NarrationSettings[] = [
      {
        id: "narr-0",
        label: "Narration 1",
        duration: 10,
        sourceUrl: "audio.mp3",
      },
    ];

    const segmentDurations = narration.map((n) => n.duration ?? 1);
    const track = buildVisualTrack(
      imagesBySegment,
      videosBySegment,
      narration,
      segmentDurations
    );

    expect(track.length).toBe(2);
    expect(track[0].duration).toBe(5); // 10 / 2
    expect(track[1].duration).toBe(5);
    expect(track[0].startTime).toBe(0);
    expect(track[1].startTime).toBe(5);
  });

  it("uses different effects for consecutive clips", () => {
    const imagesBySegment = new Map<number, ImageAsset[]>([
      [
        0,
        [
          {
            id: "img-run123-0-0",
            label: "Image 1",
            prompt: "portrait 1",
            sourceUrl: "img1.jpg",
          },
          {
            id: "img-run123-0-1",
            label: "Image 2",
            prompt: "portrait 2",
            sourceUrl: "img2.jpg",
          },
        ],
      ],
    ]);
    const videosBySegment = new Map<number, VideoAsset>();

    const narration: NarrationSettings[] = [
      {
        id: "narr-0",
        label: "Narration 1",
        duration: 10,
        sourceUrl: "audio.mp3",
      },
    ];

    const segmentDurations = narration.map((n) => n.duration ?? 1);
    const track = buildVisualTrack(
      imagesBySegment,
      videosBySegment,
      narration,
      segmentDurations
    );

    // For portraits with only 2 effects, they should be different
    expect(track[0].startScale).not.toBe(track[1].startScale);
  });
});

describe("buildVoiceTrack", () => {
  it("creates voice clips from narration", () => {
    const narration: NarrationSettings[] = [
      {
        id: "narr-0",
        label: "Narration 1",
        duration: 5,
        sourceUrl: "audio/narr1.mp3",
      },
      {
        id: "narr-1",
        label: "Narration 2",
        duration: 7,
        sourceUrl: "audio/narr2.mp3",
      },
    ];

    const segmentDurations = narration.map((n) => n.duration ?? 1);
    const track = buildVoiceTrack(narration, segmentDurations);

    expect(track.length).toBe(2);
    expect(track[0].startTime).toBe(0);
    expect(track[0].duration).toBe(5);
    expect(track[1].startTime).toBe(5);
    expect(track[1].duration).toBe(7);
    expect(track[0].volume).toBe(1.0);
    expect(track[0].narrationAssetId).toBe("narr-0");
    expect(track[1].narrationAssetId).toBe("narr-1");
  });

  it("handles empty narration array", () => {
    const track = buildVoiceTrack([], []);
    expect(track.length).toBe(0);
  });
});

describe("buildMusicTrack", () => {
  it("creates music clips spanning full duration", () => {
    const music: MusicSettings[] = [
      {
        id: "music-0",
        label: "Background Music",
        audioUrl: "music/bg.mp3",
      },
    ];

    const track = buildMusicTrack(music, 30, "run123");

    expect(track.length).toBe(1);
    expect(track[0].startTime).toBe(0);
    expect(track[0].duration).toBe(30);
    expect(track[0].volume).toBe(0.3);
    expect(track[0].fadeInDuration).toBe(2);
    expect(track[0].fadeOutDuration).toBe(3);
    expect(track[0].musicAssetId).toBe("music-0");
  });

  it("handles empty music array", () => {
    const track = buildMusicTrack([], 30, "run123");
    expect(track.length).toBe(0);
  });
});

describe("calculateTotalDuration", () => {
  it("sums narration durations", () => {
    const durations = [5, 10, 3];
    const total = calculateTotalDuration(durations);
    expect(total).toBe(18);
  });

  it("handles missing durations", () => {
    const durations = [5, 1]; // previously missing duration defaults to 1
    const total = calculateTotalDuration(durations);
    expect(total).toBe(6);
  });

  it("returns 0 for empty array", () => {
    const total = calculateTotalDuration([]);
    expect(total).toBe(0);
  });
});

describe("assembleTimeline", () => {
  it("assembles complete timeline from inputs", () => {
    const input = {
      images: [
        {
          id: "img-run123-0-0",
          label: "Image 1",
          prompt: "test image",
          sourceUrl: "img1.jpg",
        },
      ],
      narration: [
        {
          id: "narr-0",
          label: "Narration 1",
          duration: 10,
          sourceUrl: "audio.mp3",
        },
      ],
      music: [
        {
          id: "music-0",
          label: "Music",
          audioUrl: "music.mp3",
        },
      ],
      runId: "run123",
    };

    const timeline = assembleTimeline(input);

    expect(timeline.id).toBe("timeline-run123");
    expect(timeline.name).toBe("Timeline");
    expect(timeline.duration).toBe(10);
    expect(timeline.tracks.visual.length).toBe(1);
    expect(timeline.tracks.voice.length).toBe(1);
    expect(timeline.tracks.music.length).toBe(1);
    expect(timeline.tracks.soundEffects.length).toBe(0);
  });

  it("throws error when no images provided", () => {
    const input = {
      images: [],
      videos: [],
      narration: [
        {
          id: "narr-0",
          label: "Narration",
          duration: 10,
          sourceUrl: "audio.mp3",
        },
      ],
      music: [],
      runId: "run123",
    };

    expect(() => assembleTimeline(input)).toThrow(
      "No images or videos available for timeline"
    );
  });

  it("throws error when no narration provided", () => {
    const input = {
      images: [
        {
          id: "img-run123-0-0",
          label: "Image",
          prompt: "test",
          sourceUrl: "img.jpg",
        },
      ],
      narration: [],
      music: [],
      runId: "run123",
    };

    expect(() => assembleTimeline(input)).toThrow(
      "No narration available for timeline"
    );
  });

  it("handles multiple segments correctly", () => {
    const input = {
      images: [
        {
          id: "img-run123-0-0",
          label: "Segment 1 Image",
          prompt: "image 1",
          sourceUrl: "img1.jpg",
        },
        {
          id: "img-run123-1-0",
          label: "Segment 2 Image",
          prompt: "image 2",
          sourceUrl: "img2.jpg",
        },
      ],
      narration: [
        {
          id: "narr-0",
          label: "Segment 1 Narration",
          duration: 5,
          sourceUrl: "audio1.mp3",
        },
        {
          id: "narr-1",
          label: "Segment 2 Narration",
          duration: 8,
          sourceUrl: "audio2.mp3",
        },
      ],
      music: [],
      runId: "run123",
    };

    const timeline = assembleTimeline(input);

    expect(timeline.duration).toBe(13); // 5 + 8
    expect(timeline.tracks.visual.length).toBe(2);
    expect(timeline.tracks.voice.length).toBe(2);
  });
});
