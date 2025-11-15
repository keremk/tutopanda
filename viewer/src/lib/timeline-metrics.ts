import type { TimelineClip, TimelineDocument, TimelineTrack } from "@/types/timeline";

export interface TimelineMetrics {
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  pixelsPerSecond: number;
}

export const calculateTimelineMetrics = (
  timeline: TimelineDocument,
  timelineWidth: number,
): TimelineMetrics => {
  const clips = flattenTimelineClips(timeline).map((entry) => entry.clip);
  const maxClipEndTime =
    clips.length > 0
      ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
      : 0;
  const contentDurationWithPadding =
    maxClipEndTime > 0 ? maxClipEndTime * 1.25 : 10;
  const maxVisibleDuration = 60;
  const totalContentDuration = Math.max(contentDurationWithPadding, 10);
  const needsHorizontalScroll = totalContentDuration > maxVisibleDuration;
  const effectiveWidth = needsHorizontalScroll
    ? (timelineWidth * totalContentDuration) / maxVisibleDuration
    : timelineWidth;
  const pixelsPerSecond =
    totalContentDuration > 0
      ? effectiveWidth / totalContentDuration
      : timelineWidth / 10;

  return {
    totalContentDuration,
    needsHorizontalScroll,
    effectiveWidth,
    pixelsPerSecond,
  };
};

export const flattenTimelineClips = (
  timeline: TimelineDocument,
): Array<{ track: TimelineTrack; clip: TimelineClip }> => {
  const entries: Array<{ track: TimelineTrack; clip: TimelineClip }> = [];

  for (const track of timeline.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      entries.push({ track, clip });
    }
  }

  return entries.sort((a, b) => a.clip.startTime - b.clip.startTime);
};
