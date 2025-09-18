import { type TimelineComponent } from '@/schema';

export interface TimelineMetrics {
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  pixelsPerSecond: number;
}

export function calculateTimelineMetrics(
  components: TimelineComponent[],
  timelineWidth: number
): TimelineMetrics {
  // Calculate smart timeline duration
  const maxClipEndTime = components.length > 0
    ? Math.max(...components.map(c => c.startTime + c.duration))
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