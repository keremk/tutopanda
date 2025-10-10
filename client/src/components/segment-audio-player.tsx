"use client";

import { useRef, useEffect } from "react";

interface SegmentAudioPlayerProps {
  audioUrl: string;
  segmentStartTime: number; // In global timeline (seconds)
  segmentDuration: number;
  isPlaying: boolean;
  currentTime: number; // Global timeline currentTime
  onTimeUpdate: (globalTime: number) => void;
  onSegmentEnd: () => void; // Called when segment ends (for looping)
}

/**
 * Hidden audio player that plays a single timeline segment.
 * Handles conversion between global timeline time and audio playback time.
 * Designed to be controlled by the timeline's play/pause/seek interface.
 */
export default function SegmentAudioPlayer({
  audioUrl,
  segmentStartTime,
  segmentDuration,
  isPlaying,
  currentTime,
  onTimeUpdate,
  onSegmentEnd,
}: SegmentAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);

  // Calculate if current time is within segment bounds
  const segmentEndTime = segmentStartTime + segmentDuration;
  const isWithinSegment = currentTime >= segmentStartTime && currentTime < segmentEndTime;

  // Convert global timeline time to audio playback position
  const globalTimeToAudioTime = (globalTime: number): number => {
    return Math.max(0, Math.min(globalTime - segmentStartTime, segmentDuration));
  };

  // Convert audio playback position to global timeline time
  const audioTimeToGlobalTime = (audioTime: number): number => {
    return segmentStartTime + audioTime;
  };

  // Handle play/pause state changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // If playing but not within segment, stop audio
      if (!isWithinSegment) {
        audio.pause();
        return;
      }

      const audioTime = globalTimeToAudioTime(currentTime);

      // Sync audio position if needed (tolerance of 100ms)
      if (Math.abs(audio.currentTime - audioTime) > 0.1) {
        audio.currentTime = audioTime;
      }

      audio.play().catch((err) => {
        console.error("Segment audio playback failed:", err);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTime, isWithinSegment, segmentStartTime]);

  // Handle seeking from timeline
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isPlaying) return; // Don't interfere while playing

    if (isWithinSegment) {
      const audioTime = globalTimeToAudioTime(currentTime);
      audio.currentTime = audioTime;
    }
  }, [currentTime, isWithinSegment, isPlaying, segmentStartTime]);

  // Continuous time updates during playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      if (!isPlaying) {
        rafRef.current = null;
        return;
      }

      const globalTime = audioTimeToGlobalTime(audio.currentTime);

      // Only update if time has changed (throttle updates)
      if (Math.abs(globalTime - lastUpdateTimeRef.current) > 0.01) {
        lastUpdateTimeRef.current = globalTime;
        onTimeUpdate(globalTime);
      }

      // Check if segment has ended
      if (audio.currentTime >= segmentDuration - 0.05) {
        console.log("🔄 Segment playback ended, looping...");
        onSegmentEnd();
        return;
      }

      rafRef.current = requestAnimationFrame(updateTime);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, segmentDuration, onTimeUpdate, onSegmentEnd, segmentStartTime]);

  // Debug logging
  useEffect(() => {
    console.log("🎵 Segment Audio Player:", {
      audioUrl: audioUrl.substring(0, 50) + "...",
      segmentStartTime,
      segmentDuration,
      isPlaying,
      currentTime,
      isWithinSegment,
    });
  }, [audioUrl, segmentStartTime, segmentDuration, isPlaying, currentTime, isWithinSegment]);

  return (
    <audio
      ref={audioRef}
      src={audioUrl}
      preload="auto"
      style={{ display: "none" }}
    />
  );
}
