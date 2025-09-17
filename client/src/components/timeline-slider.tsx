"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TimelineSliderProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
}

export const TimelineSlider = ({ currentTime, duration, onSeek, className }: TimelineSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;

    setIsDragging(true);
    setDragStartX(x);
    setDragStartTime(currentTime);
  }, [currentTime]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const deltaX = x - dragStartX;
    const deltaPercent = (deltaX / rect.width) * 100;
    const deltaTime = (deltaPercent / 100) * duration;

    const newTime = Math.max(0, Math.min(duration, dragStartTime + deltaTime));
    onSeek(newTime);
  }, [isDragging, dragStartX, dragStartTime, duration, onSeek]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;

    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    const newTime = Math.max(0, Math.min((percent / 100) * duration, duration));

    onSeek(newTime);
  }, [isDragging, duration, onSeek]);

  // Add mouse move and mouse up listeners to document when dragging
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

  // Calculate playhead position
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("w-full", className)}>
      {/* Time markers and progress line container */}
      <div
        ref={containerRef}
        className="relative h-8 cursor-pointer"
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
        {Array.from({ length: Math.floor(duration / 5) + 1 }, (_, i) => {
          const seconds = i * 5;
          const position = (seconds / duration) * 100;
          return (
            <div
              key={`major-${seconds}`}
              className="absolute flex flex-col items-center pointer-events-none"
              style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-3 bg-muted-foreground/70 mb-1"></div>
              <span className="text-xs text-muted-foreground">
                {seconds}s
              </span>
            </div>
          );
        })}

        {/* Minor ticks every 1 second */}
        {Array.from({ length: Math.floor(duration) + 1 }, (_, i) => {
          if (i % 5 === 0) return null; // Skip major markers
          const position = (i / duration) * 100;
          return (
            <div
              key={`minor-${i}`}
              className="absolute w-px h-1.5 bg-muted-foreground/40 pointer-events-none"
              style={{
                left: `${position}%`,
                transform: 'translateX(-50%)',
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
  );
};