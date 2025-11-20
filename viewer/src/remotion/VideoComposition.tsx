import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import type {
  AudioTrack,
  ImageTrack,
  MusicTrack,
  TimelineDocument,
  TimelineTrack,
  VideoTrack,
} from "@/types/timeline";
import { buildAssetUrl } from "@/data/client";
import { KenBurnsClip } from "./KenBurnsClip";
import { VideoClipSequence } from "./VideoClip";

interface VideoCompositionProps {
  timeline: TimelineDocument;
  movieId: string;
}

const secondsToFrames = (seconds: number, fps: number) =>
  Math.max(1, Math.round(seconds * fps));

export const VideoComposition = ({ timeline, movieId }: VideoCompositionProps) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {timeline.tracks.map((track) => renderTrack(track, movieId, fps))}
    </AbsoluteFill>
  );
};

function renderTrack(track: TimelineTrack, movieId: string, fps: number) {
  if (isImageTrack(track)) {
    return renderImageTrack(track, movieId, fps);
  }
  if (isAudioTrack(track)) {
    return renderAudioTrack(track, movieId, fps);
  }
  if (isMusicTrack(track)) {
    return renderMusicTrack(track, movieId, fps);
  }
  if (isVideoTrack(track)) {
    return renderVideoTrack(track, movieId, fps);
  }
  return null;
}

function isImageTrack(track: TimelineTrack): track is ImageTrack {
  return track.kind === "Image";
}

function isAudioTrack(track: TimelineTrack): track is AudioTrack {
  return track.kind === "Audio";
}

function isMusicTrack(track: TimelineTrack): track is MusicTrack {
  return track.kind === "Music";
}

function isVideoTrack(track: TimelineTrack): track is VideoTrack {
  return track.kind === "Video";
}

function renderImageTrack(track: ImageTrack, movieId: string, fps: number) {
  return track.clips.map((clip) => {
    const from = secondsToFrames(clip.startTime, fps);
    const durationInFrames = secondsToFrames(clip.duration, fps);
    return (
      <Sequence
        key={clip.id}
        from={from}
        durationInFrames={durationInFrames}
      >
        <KenBurnsClip clip={clip} movieId={movieId} />
      </Sequence>
    );
  });
}

function renderAudioTrack(track: AudioTrack, movieId: string, fps: number) {
  return track.clips.map((clip) => {
    const assetId = clip.properties.assetId;
    if (!assetId) {
      return null;
    }
    const src = buildAssetUrl(movieId, assetId);
    const from = secondsToFrames(clip.startTime, fps);
    const durationInFrames = secondsToFrames(clip.duration, fps);
    const volume = clip.properties.volume ?? 1;
    const premountFor = Math.max(1, Math.round(fps * 0.5));

    return (
      <Sequence
        key={clip.id}
        from={from}
        durationInFrames={durationInFrames}
        premountFor={premountFor}
      >
        <Audio src={src} volume={volume} />
      </Sequence>
    );
  });
}

function renderMusicTrack(track: MusicTrack, movieId: string, fps: number) {
  return track.clips.map((clip) => {
    const assetId = clip.properties.assetId;
    if (!assetId) {
      return null;
    }
    const src = buildAssetUrl(movieId, assetId);
    const from = secondsToFrames(clip.startTime, fps);
    const durationInFrames = secondsToFrames(clip.duration, fps);
    const volume = clip.properties.volume ?? 1;
    const premountFor = Math.max(1, Math.round(fps * 0.5));

    return (
      <Sequence
        key={clip.id}
        from={from}
        durationInFrames={durationInFrames}
        premountFor={premountFor}
      >
        <Audio src={src} volume={volume} />
      </Sequence>
    );
  });
}

function renderVideoTrack(track: VideoTrack, movieId: string, fps: number) {
  return track.clips.map((clip) => {
    const from = secondsToFrames(clip.startTime, fps);
    const durationInFrames = secondsToFrames(clip.duration, fps);
    const premountFor = Math.max(1, Math.round(fps * 0.5));
    return (
      <VideoClipSequence
        key={clip.id}
        clip={clip}
        movieId={movieId}
        fps={fps}
        from={from}
        durationInFrames={durationInFrames}
        premountFor={premountFor}
      />
    );
  });
}
