/**
 * Maps a composition frame to the corresponding source frame when playing
 * a video at a constant speed multiplier.
 */
export function remapSpeed(frame: number, playbackRate: number): number {
  if (!Number.isFinite(frame) || frame <= 0) {
    return 0;
  }

  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return frame;
  }

  return frame * playbackRate;
}
