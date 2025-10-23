/**
 * Calculates the remapped frame for constant playback rate.
 * Based on Remotion documentation pattern for accelerated video.
 *
 * @param frame - Current frame number in the composition
 * @param playbackRate - Speed multiplier (e.g., 1.15 = 15% faster)
 * @returns The remapped frame number in the source video
 *
 * @example
 * // Video at 1.5x speed
 * remapSpeed(30, 1.5) // Returns 45 (playing 1.5 frames per composition frame)
 */
export function remapSpeed(frame: number, playbackRate: number): number {
  let framesPassed = 0;
  for (let i = 0; i <= frame; i++) {
    framesPassed += playbackRate;
  }
  return framesPassed;
}
