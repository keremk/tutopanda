import {
  type AnyTimelineClip,
  type Timeline,
  type TimelineTrackKey,
  timelineTrackKeys,
} from '@/types/types';

export interface TimelineMetrics {
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  pixelsPerSecond: number;
}

export function calculateTimelineMetrics(
  timeline: Timeline,
  timelineWidth: number
): TimelineMetrics {
  const clips = flattenTimelineClips(timeline).map((entry) => entry.clip);

  // Calculate smart timeline duration
  const maxClipEndTime = clips.length > 0
    ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
    : 0;

  // Add 25% padding to content, minimum 10s for empty timelines
  const contentDurationWithPadding = maxClipEndTime > 0 ? maxClipEndTime * 1.25 : 10;

  // Cap visible timeline at 60s, but track total content for scrolling
  const maxVisibleDuration = 60;
  const totalContentDuration = Math.max(contentDurationWithPadding, 10);

  // Determine if we need horizontal scrolling
  const needsHorizontalScroll = totalContentDuration > maxVisibleDuration;

  // For scrollable timelines, calculate width based on total content
  // For non-scrollable timelines, use the actual visible duration
  const effectiveWidth = needsHorizontalScroll
    ? (timelineWidth * totalContentDuration / maxVisibleDuration)
    : timelineWidth;

  const pixelsPerSecond = totalContentDuration > 0 ? effectiveWidth / totalContentDuration : timelineWidth / 10;

  return {
    totalContentDuration,
    needsHorizontalScroll,
    effectiveWidth,
    pixelsPerSecond,
  };
}

export function flattenTimelineClips(timeline: Timeline): Array<{
  track: TimelineTrackKey;
  clip: AnyTimelineClip;
}> {
  const entries: Array<{ track: TimelineTrackKey; clip: AnyTimelineClip }> = [];

  for (const track of timelineTrackKeys) {
    const clips = timeline.tracks?.[track] ?? [];
    for (const clip of clips) {
      entries.push({ track, clip: clip as AnyTimelineClip });
    }
  }

  return entries.sort((a, b) => a.clip.startTime - b.clip.startTime);
}
