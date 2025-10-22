# Timeline Assembly Strategy - Phase 2: Remotion Rendering & MP4 Export

## Overview
This phase implements the Remotion rendering logic to actually apply speed adjustments and transitions during video playback and MP4 export. Phase 1 must be completed first (types, persistence, UI, strategy selection).

## Context
After Phase 1, the timeline assembler generates metadata on video clips:
- `originalDuration`: Actual video file duration (e.g., 10s)
- `speedAdjustment`: Playback speed multiplier (e.g., 1.15x) - only for speed-adjustment strategy
- `transitionType`: "freeze-fade" | "crossfade" | "none" - only for styled-transition strategy
- `transitionDuration`: Transition effect duration in seconds

**Current Problem**: The Remotion composition renders videos at fixed duration, ignoring this metadata.

**Goal**: Make Remotion actually apply the speed adjustments and transitions during both:
1. Live preview in the Player
2. MP4 export via `@remotion/renderer`

## Phase 2 Goals
1. Replace `<Video>` with `<OffthreadVideo>` (required for playbackRate)
2. Implement speed adjustment rendering using Remotion's frame remapping pattern
3. Implement freeze-fade transition rendering
4. Extend asset storage for rendered videos
5. Create MP4 export Inngest function
6. Wire Export button to trigger rendering

## Technical Constraints

### Remotion Rendering Fundamentals
- **OffthreadVideo**: Uses FFmpeg during rendering, supports `playbackRate`
- **Video**: Browser-based, does NOT support `playbackRate` during rendering
- **Idempotent rendering**: Each frame must render independently
- **Frame remapping**: Cannot just interpolate playbackRate - must accumulate

### MP4 Export Compatibility
- ✅ OffthreadVideo + playbackRate: Works with FFmpeg rendering
- ✅ Supported formats: H.264/H.265 (MP4), VP8/VP9 (WebM), ProRes, GIF
- ✅ MediaBunny: Compatible (Remotion phasing in Sept 2025, doesn't affect rendering)
- ⚠️ Must use `#disable` suffix on video URLs to disable media fragment hints

### Narration as Master Timeline
- Narration duration = total timeline duration
- Videos adapt to narration via speed/transitions
- NO changes to audio track timing

## Implementation Steps

### Step 1: Create Speed Remapping Utility

**New File**: `client/src/lib/remotion/remap-speed.ts`

```typescript
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
```

**Why**: Remotion evaluates each frame independently. We must accumulate the playback rate from frame 0 to current frame to determine which source video frame to show.

### Step 2: Create Video Clip Renderer Component

**New File**: `client/src/components/remotion/video-clip-renderer.tsx`

```typescript
import { Sequence, OffthreadVideo, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { remapSpeed } from '@/lib/remotion/remap-speed';
import type { VideoClip } from '@/types/types';

interface VideoClipRendererProps {
  clip: VideoClip;
  videoUrl: string;
}

export const VideoClipRenderer: React.FC<VideoClipRendererProps> = ({ clip, videoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(clip.startTime * fps);
  const durationInFrames = Math.round(clip.duration * fps);

  // Disable media fragment hints (required for frame-accurate seeking)
  const videoUrlWithDisable = `${videoUrl}#disable`;

  // Case 1: Speed Adjustment
  if (clip.speedAdjustment && clip.speedAdjustment !== 1) {
    const localFrame = frame - startFrame;
    const remappedFrame = remapSpeed(localFrame, clip.speedAdjustment);

    return (
      <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
        <OffthreadVideo
          src={videoUrlWithDisable}
          startFrom={Math.round(remappedFrame)}
          playbackRate={clip.speedAdjustment}
          muted={true}
          volume={clip.volume ?? 0}
          style={{ width: '100%', height: '100%' }}
        />
      </Sequence>
    );
  }

  // Case 2: Freeze-Fade Transition
  if (clip.transitionType === 'freeze-fade' && clip.originalDuration && clip.transitionDuration) {
    const originalDurationFrames = Math.round(clip.originalDuration * fps);
    const transitionFrames = Math.round(clip.transitionDuration * fps);

    return (
      <>
        {/* Video plays at normal speed */}
        <Sequence key={`${clip.id}-video`} from={startFrame} durationInFrames={originalDurationFrames}>
          <OffthreadVideo
            src={videoUrlWithDisable}
            muted={true}
            volume={clip.volume ?? 0}
            style={{ width: '100%', height: '100%' }}
          />
        </Sequence>

        {/* Freeze last frame and fade to black */}
        <Sequence key={`${clip.id}-freeze`} from={startFrame + originalDurationFrames} durationInFrames={transitionFrames}>
          <Img
            src={videoUrlWithDisable}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: interpolate(
                frame - (startFrame + originalDurationFrames),
                [0, transitionFrames],
                [1, 0],
                { extrapolateRight: 'clamp' }
              ),
            }}
          />
        </Sequence>
      </>
    );
  }

  // Case 3: Crossfade (defer to future)
  if (clip.transitionType === 'crossfade') {
    console.warn(`Crossfade transition not yet implemented for clip ${clip.id}`);
    // Fall through to normal rendering
  }

  // Case 4: Normal rendering (no adjustment)
  return (
    <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
      <OffthreadVideo
        src={videoUrlWithDisable}
        muted={true}
        volume={clip.volume ?? 0}
        style={{ width: '100%', height: '100%' }}
      />
    </Sequence>
  );
};
```

**Key Points**:
- Uses `OffthreadVideo` instead of `Video` (required for playbackRate)
- `startFrom` prop (not `trimBefore`) positions video at correct frame
- `#disable` suffix prevents media fragment optimization issues
- Freeze-fade uses `<Img>` to show last frame with opacity fade
- Crossfade logs warning and falls back to normal rendering

### Step 3: Update Video Composition to Use New Renderer

**File**: `client/src/components/remotion/video-composition.tsx`

**Find the visual track rendering** (around lines 124-149):

**Replace** the video rendering logic:

```typescript
// Visual track
{(timeline.tracks?.visual ?? []).map((clip) => {
  if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
    return null;
  }

  if (clip.kind === 'video') {
    const videoUrl = resolveVideoUrl(clip, videoMap, cacheKey);
    if (!videoUrl) {
      return null;
    }

    // Use new VideoClipRenderer component
    return <VideoClipRenderer key={clip.id} clip={clip} videoUrl={videoUrl} />;
  }

  // Ken Burns rendering (unchanged)
  const isActive =
    currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;

  if (!isActive) return null;

  const relativeTime = currentTime - clip.startTime;
  const progress = Math.min(relativeTime / clip.duration, 1);
  const imageUrl = resolveImageUrl(clip, imageMap, cacheKey);

  if (!imageUrl) {
    return null;
  }

  if (clip.kind !== 'kenBurns') {
    return null;
  }

  return (
    <KenBurnsComponent
      key={clip.id}
      component={{
        ...clip,
        imageUrl,
      }}
      progress={progress}
    />
  );
})}
```

**Add import** (top of file):
```typescript
import { VideoClipRenderer } from './video-clip-renderer';
```

### Step 4: Extend Asset Storage for Rendered Videos

**File**: `client/src/services/lecture/storage/lecture-asset-storage.ts`

**Update** `LectureAssetCategory` type (line 11):
```typescript
export type LectureAssetCategory = "images" | "music" | "narration" | "videos" | "render";
```

**Add methods** to the return object (after line 103, before line 105):
```typescript
const saveRender = (
  content: Buffer | Uint8Array | ReadableStream,
  lectureId: number
) => saveAsset("render", `lecture-${lectureId}.mp4`, content);

const resolveRenderPath = (lectureId: number) =>
  resolveAssetPath("render", `lecture-${lectureId}.mp4`);
```

**Update return type** `LectureAssetStorage` interface (add to line 44):
```typescript
saveRender: (
  content: Buffer | Uint8Array | ReadableStream,
  lectureId: number
) => Promise<string>;
resolveRenderPath: (lectureId: number) => string;
```

**Add to return object** (line 105-117):
```typescript
return {
  basePath,
  resolveAssetPath,
  saveAsset,
  saveImage,
  resolveImagePath,
  saveVideo,
  resolveVideoPath,
  saveNarration,
  resolveNarrationPath,
  saveMusic,
  resolveMusicPath,
  saveRender,        // ADD
  resolveRenderPath, // ADD
};
```

**Path structure**: `${userId}/${projectId}/${lectureId}/render/lecture-${lectureId}.mp4`

### Step 5: Create Render Video Inngest Function

**New File**: `client/src/inngest/functions/render-video.ts`

```typescript
import { getInngestApp } from "@/inngest/client";
import { createLectureLogger, createLectureProgressPublisher } from "./workflow-utils";
import { getLectureById } from "@/data/lecture/repository";
import { createLectureAssetStorage } from "@/services/lecture/storage/lecture-asset-storage";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { webpackOverride } from "@/remotion/webpack-override"; // If you have webpack config
import path from "path";
import fs from "fs/promises";

const inngest = getInngestApp();

export type RenderVideoEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
};

export const renderVideo = inngest.createFunction(
  { id: "render-video" },
  { event: "app/render-video" },
  async ({ event, publish, logger, step }) => {
    const { userId, runId, lectureId, projectId } = event.data as RenderVideoEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: 4,
      log,
    });

    await publishStatus("Preparing video render", 1);

    // Load lecture with timeline
    const lecture = await step.run("load-lecture", async () => {
      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error(`Lecture ${lectureId} not found`);
      }
      if (!lecture.timeline) {
        throw new Error("Timeline not available for rendering");
      }
      log.info("Loaded lecture for rendering", { lectureId });
      return lecture;
    });

    // Bundle Remotion composition
    const bundleLocation = await step.run("bundle-composition", async () => {
      await publishStatus("Bundling composition", 2);

      const bundleLocation = await bundle({
        entryPoint: path.join(process.cwd(), "src/components/remotion/video-composition.tsx"),
        webpackOverride, // Optional: if you have custom webpack config
      });

      log.info("Bundled composition", { bundleLocation });
      return bundleLocation;
    });

    // Render video to temporary file
    const outputPath = await step.run("render-video", async () => {
      await publishStatus("Rendering video", 3);

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "VideoComposition",
        inputProps: {
          timeline: lecture.timeline,
          images: lecture.images ?? [],
          videos: lecture.videos ?? [],
          narration: lecture.narration ?? [],
          music: lecture.music ?? [],
          cacheKey: Date.now(),
        },
      });

      const tmpDir = path.join(process.cwd(), "tmp");
      await fs.mkdir(tmpDir, { recursive: true });
      const outputPath = path.join(tmpDir, `render-${runId}.mp4`);

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: outputPath,
        inputProps: {
          timeline: lecture.timeline,
          images: lecture.images ?? [],
          videos: lecture.videos ?? [],
          narration: lecture.narration ?? [],
          music: lecture.music ?? [],
          cacheKey: Date.now(),
        },
      });

      log.info("Rendered video to temporary file", { outputPath });
      return outputPath;
    });

    // Save to FlyStorage
    const videoUrl = await step.run("save-to-storage", async () => {
      await publishStatus("Saving rendered video", 4);

      const storage = createLectureAssetStorage({ userId, projectId, lectureId });
      const fileBuffer = await fs.readFile(outputPath);
      const storagePath = await storage.saveRender(fileBuffer, lectureId);

      // Clean up temporary file
      await fs.unlink(outputPath);

      log.info("Saved rendered video to storage", { storagePath });
      return storagePath;
    });

    await publishStatus("Video rendering complete", 4, "complete");

    // Publish completion event with download URL
    await step.run("notify-render-complete", async () => {
      const { lectureProgressChannel } = await import("./workflow-utils");
      await publish(
        lectureProgressChannel(userId).progress({
          type: "render-complete",
          runId,
          lectureId,
          videoUrl: `/api/storage/${videoUrl}`,
          timestamp: new Date().toISOString(),
        })
      );
      log.info("Render completion notification sent");
    });

    return { runId, videoUrl };
  }
);
```

**Note**: You may need to adjust paths and webpack config based on your actual setup.

### Step 6: Create Render Video Action

**New File**: `client/src/app/actions/render-video.ts`

```typescript
"use server";

import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { RenderVideoEvent } from "@/inngest/functions/render-video";

const inngest = getInngestApp();

type RenderVideoInput = {
  lectureId: number;
};

export async function renderVideoAction({ lectureId }: RenderVideoInput) {
  const { user } = await getSession();

  // Fetch lecture to validate access
  const lecture = await getLectureById({ lectureId });

  if (!lecture) {
    throw new Error("Lecture not found");
  }

  if (!lecture.timeline) {
    throw new Error("Timeline not available - generate timeline first");
  }

  // Generate new run ID for the workflow
  const runId = randomUUID();

  // Send event to Inngest
  await inngest.send({
    name: "app/render-video",
    data: {
      userId: user.id,
      runId,
      lectureId,
      projectId: lecture.projectId,
    } satisfies RenderVideoEvent,
  });

  return { runId, success: true };
}
```

### Step 7: Wire Export Button

**File**: `client/src/components/video-command-bar.tsx`

**Update** `handleExport` function:

```typescript
import { renderVideoAction } from "@/app/actions/render-video";

// ... in component

const handleExport = async () => {
  try {
    setIsExporting(true);
    const result = await renderVideoAction({ lectureId });
    console.log("Video rendering started:", result.runId);
    // User will see progress in agent panel
  } catch (error) {
    console.error("Failed to start video rendering:", error);
  } finally {
    setIsExporting(false);
  }
};
```

### Step 8: Update Agent Progress to Show Render Progress

**File**: `client/src/inngest/functions/workflow-utils.ts`

**Add** render event types to `LectureProgressMessage`:

```typescript
export type LectureProgressMessage =
  | LectureStatusMessage
  | LectureReasoningMessage
  | LectureResultMessage
  | LectureConfigMessage
  | LectureImagePreviewMessage
  | LectureVideoPreviewMessage
  | LectureVideoImagePreviewMessage
  | LectureNarrationPreviewMessage
  | LectureMusicPreviewMessage
  | LectureImageCompleteMessage
  | LectureVideoCompleteMessage
  | LectureVideoImageCompleteMessage
  | LectureNarrationCompleteMessage
  | LectureMusicCompleteMessage
  | LectureTimelineCompleteMessage
  | LectureRenderCompleteMessage; // ADD THIS

// ... later in file

export type LectureRenderCompleteMessage = {
  type: "render-complete";
  runId: string;
  lectureId: number;
  videoUrl: string;
  timestamp: string;
};
```

**File**: `client/src/components/agent-progress.tsx`

**Add** case for render completion (in the switch statement around line 278-365):

```typescript
case "render-complete": {
  current.renderComplete = payload;
  current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
  break;
}
```

**Add** UI to display download link (in the run details rendering):

```typescript
{run.renderComplete ? (
  <div className="mt-3 rounded-md border border-border/60 bg-card/30 p-3">
    <h4 className="mb-2 text-sm font-medium text-foreground">Video Rendered</h4>
    <p className="text-sm text-muted-foreground mb-2">
      Your video has been rendered and is ready for download.
    </p>
    <Button
      size="sm"
      variant="outline"
      onClick={() => window.open(run.renderComplete!.videoUrl, '_blank')}
    >
      <Download className="mr-2 h-4 w-4" />
      Download Video
    </Button>
  </div>
) : null}
```

## Testing Checklist

### Remotion Preview (Player)
- [ ] Speed-adjusted videos play at correct speed in preview
- [ ] Freeze-fade transitions show video then fade last frame
- [ ] No console errors during playback
- [ ] Timeline duration matches narration duration

### MP4 Export
- [ ] Export button triggers rendering
- [ ] Agent panel shows render progress
- [ ] Video saves to `${userId}/${projectId}/${lectureId}/render/lecture-${lectureId}.mp4`
- [ ] Download link appears when complete
- [ ] Exported MP4 has correct speed adjustments
- [ ] Exported MP4 has freeze-fade transitions
- [ ] Exported video duration matches timeline duration
- [ ] Audio sync is correct (narration as master)

### Asset Storage
- [ ] `saveRender()` uses FlyStorage like other assets
- [ ] Render folder created in correct path
- [ ] File can be downloaded via `/api/storage/` route

### Error Handling
- [ ] Shows error if timeline not available
- [ ] Shows error if render fails
- [ ] Cleans up temporary files on error

## Files Created/Modified Summary

### New Files
1. `client/src/lib/remotion/remap-speed.ts` - Speed remapping utility
2. `client/src/components/remotion/video-clip-renderer.tsx` - Video rendering component
3. `client/src/inngest/functions/render-video.ts` - MP4 export Inngest function
4. `client/src/app/actions/render-video.ts` - Export action

### Modified Files
1. `client/src/components/remotion/video-composition.tsx` - Use VideoClipRenderer
2. `client/src/services/lecture/storage/lecture-asset-storage.ts` - Add render category
3. `client/src/components/video-command-bar.tsx` - Wire export button
4. `client/src/inngest/functions/workflow-utils.ts` - Add render events
5. `client/src/components/agent-progress.tsx` - Show render progress

## Performance Considerations

- Remotion 4.0 OffthreadVideo is 281% faster than 3.3
- FFmpeg-based rendering supports all codecs
- Frame cache defaults to 50% of system memory
- Consider using Remotion Lambda for large renders

## Known Limitations

- **Crossfade transitions**: Not implemented (deferred to future)
- **Playback rate limits**: Browser limits 0.0625-16x (rendering has no limits)
- **Frame accuracy**: Requires `#disable` suffix on video URLs

## Next Steps (Future Enhancements)

1. Implement crossfade transitions
2. Add render quality settings (resolution, bitrate)
3. Add progress bar during rendering
4. Support rendering to different formats (WebM, GIF)
5. Add subtitles/captions to rendered video
