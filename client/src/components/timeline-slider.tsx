"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TimelineSliderProps {
  currentTime: number;
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  onSeek: (time: number) => void;
  className?: string;
}

export const TimelineSlider = ({
  currentTime,
  totalContentDuration,
  needsHorizontalScroll,
  effectiveWidth,
  onSeek,
  className
}: TimelineSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    setIsDragging(true);
    setDragStartX(x);
    setDragStartTime(currentTime);
  }, [currentTime]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const deltaX = x - dragStartX;
    const deltaPercent = (deltaX / rect.width) * 100;
    const deltaTime = (deltaPercent / 100) * totalContentDuration;

    const newTime = Math.max(0, Math.min(totalContentDuration, dragStartTime + deltaTime));
    onSeek(newTime);
  }, [isDragging, dragStartX, dragStartTime, totalContentDuration, onSeek]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;

    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const newTime = Math.max(0, Math.min((percent / 100) * totalContentDuration, totalContentDuration));

    onSeek(newTime);
  }, [isDragging, totalContentDuration, onSeek]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const playheadPercent = totalContentDuration > 0 ? (currentTime / totalContentDuration) * 100 : 0;

  return (
    <div className={cn("p-4 pb-2 border-b border-border/30", className)}>
      <div className="flex">
        {/* Spacer for icon column alignment */}
        <div className="w-16 shrink-0"></div>

        {/* TimelineSlider aligned with tracks */}
        <div className="flex-1 px-2">
          <div
            className="w-full"
            style={{
              overflowX: needsHorizontalScroll ? 'auto' : 'hidden',
              overflowY: 'hidden',
            }}
          >
            <div
              ref={sliderRef}
              className="relative h-8 cursor-pointer"
              style={{
                width: needsHorizontalScroll ? `${effectiveWidth}px` : '100%',
                minWidth: needsHorizontalScroll ? `${effectiveWidth}px` : 'auto'
              }}
              onClick={handleTimelineClick}
            >
              {/* Progress line background (full width, darker) */}
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-muted-foreground/30" />

              {/* Progress line (played portion, orange/yellow) */}
              <div
                className="absolute top-4 left-0 h-0.5 bg-gradient-to-r from-orange-400 to-yellow-500 transition-all"
                style={{ width: `${playheadPercent}%` }}
              />

              {/* Major markers every 5 seconds */}
              {Array.from({ length: Math.floor(totalContentDuration / 5) + 1 }, (_, i) => {
                const seconds = i * 5;
                const position = (seconds / totalContentDuration) * 100;
                // Don't transform the first marker (0s) to align with track start
                const transform = seconds === 0 ? 'none' : 'translateX(-50%)';
                return (
                  <div
                    key={`major-${seconds}`}
                    className={`absolute flex flex-col pointer-events-none ${seconds === 0 ? 'items-start' : 'items-center'}`}
                    style={{ left: `${position}%`, transform }}
                  >
                    <div className="w-px h-3 bg-muted-foreground/70 mb-1"></div>
                    <span className="text-xs text-muted-foreground">
                      {seconds}s
                    </span>
                  </div>
                );
              })}

              {/* Minor ticks every 1 second */}
              {Array.from({ length: Math.floor(totalContentDuration) + 1 }, (_, i) => {
                if (i % 5 === 0) return null; // Skip major markers
                const position = (i / totalContentDuration) * 100;
                // Don't transform the first tick to align with track start
                const transform = i === 0 ? 'none' : 'translateX(-50%)';
                return (
                  <div
                    key={`minor-${i}`}
                    className="absolute w-px h-1.5 bg-muted-foreground/40 pointer-events-none"
                    style={{
                      left: `${position}%`,
                      transform,
                      top: '16px'
                    }}
                  />
                );
              })}

              {/* Draggable playhead circle */}
              <div
                className="absolute top-4 z-10 cursor-grab active:cursor-grabbing"
                style={{
                  left: `${playheadPercent}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                onMouseDown={handleMouseDown}
              >
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-orange-400 to-yellow-500 border-2 border-white shadow-lg hover:scale-110 transition-transform">
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-white/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};