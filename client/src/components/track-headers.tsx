import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Film, Mic, Music, Volume2 } from 'lucide-react';
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
}

export function TrackHeaders({ className }: TrackHeadersProps) {
  const channelHeight = 48;

  return (
    <div className={`w-16 shrink-0 bg-background/80 border-r border-border/30 ${className || ''}`}>
      {/* Top spacing to align with slider + tracks padding: 56px (slider) + 16px (tracks padding) = 72px */}
      <div className="border-b border-muted/90" style={{ height: '72px' }}></div>
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
