import dynamic from 'next/dynamic';
import type { Timeline, aspectRatioValues } from '@/types/types';

interface VideoPreviewContentProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  aspectRatio?: typeof aspectRatioValues[number];
}

// Dynamic import with loading state to prevent blocking
const VideoPreviewContent = dynamic(
  () => import('./video-preview-content'),
  {
    loading: () => (
      <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center h-full">
        <div className="text-white">Loading video player...</div>
      </div>
    ),
    ssr: false, // Remotion Player doesn't work with SSR
  }
);

export default function LazyVideoPreview(props: VideoPreviewContentProps) {
  return <VideoPreviewContent {...props} />;
}
