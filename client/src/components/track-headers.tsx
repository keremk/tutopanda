import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Film, Mic, Music, Volume2, Play, Pause } from 'lucide-react';
import type { TimelineTrackKey } from '@/types/types';

interface TrackChannel {
  id: TimelineTrackKey;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  height: number;
}

const TIMELINE_CHANNELS: TrackChannel[] = [
  {
    id: 'visual',
    name: 'Visual Clips',
    icon: Film,
    height: 48,
  },
  {
    id: 'voice',
    name: 'Voice & Narration',
    icon: Mic,
    height: 48,
  },
  {
    id: 'music',
    name: 'Background Music',
    icon: Music,
    height: 48,
  },
  {
    id: 'soundEffects',
    name: 'Sound Effects',
    icon: Volume2,
    height: 48,
  },
];

interface TrackHeadersProps {
  className?: string;
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
}

export function TrackHeaders({ className, isPlaying = false, onPlay, onPause }: TrackHeadersProps) {
  const channelHeight = 48;

  const handlePlayPauseClick = () => {
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.();
    }
  };

  return (
    <div className={`w-16 shrink-0 bg-background/80 border-r border-border/30 ${className || ''}`}>
      {/* Top spacing with play/pause button: 56px (slider) + 16px (tracks padding) = 72px */}
      <div className="border-b border-muted/90 flex items-center justify-center" style={{ height: '72px' }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handlePlayPauseClick}
              className="p-2 rounded-md hover:bg-muted/50 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-foreground" />
              ) : (
                <Play className="w-5 h-5 text-foreground" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{isPlaying ? 'Pause' : 'Play'}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {TIMELINE_CHANNELS.map((channel) => {
        const IconComponent = channel.icon;
        return (
          <Tooltip key={channel.id}>
            <TooltipTrigger asChild>
              <div
                className="flex items-center justify-center hover:bg-muted/30 transition-colors border-b border-muted/90"
                style={{ height: `${channelHeight}px` }}
              >
                <IconComponent className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{channel.name}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
