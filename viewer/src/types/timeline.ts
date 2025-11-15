export type TimelineTrackKey = "visual" | "voice" | "music" | "soundEffects";

interface TimelineClipBase {
  id: string;
  kind: string;
  name: string;
  startTime: number;
  duration: number;
}

export interface KenBurnsClip extends TimelineClipBase {
  kind: "kenBurns";
  imageUrl?: string;
}

export interface VideoClip extends TimelineClipBase {
  kind: "video";
  videoUrl?: string;
}

export interface VoiceClip extends TimelineClipBase {
  kind: "voice";
  narrationAssetId?: string;
}

export interface MusicClip extends TimelineClipBase {
  kind: "music";
  musicAssetId?: string;
}

export interface SoundEffectClip extends TimelineClipBase {
  kind: "soundEffect";
  soundEffectAssetId?: string;
}

export type AnyTimelineClip =
  | KenBurnsClip
  | VideoClip
  | VoiceClip
  | MusicClip
  | SoundEffectClip;

export interface Timeline {
  id: string;
  name: string;
  duration: number;
  tracks: Record<TimelineTrackKey, AnyTimelineClip[]>;
}

export const timelineTrackKeys: TimelineTrackKey[] = [
  "visual",
  "voice",
  "music",
  "soundEffects",
];
