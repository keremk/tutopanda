# Timeline Assembly Strategy - Phase 1: Foundation & Persistence

## Overview
This phase implements the foundational infrastructure for timeline assembly strategies, including type definitions, database persistence, UI controls, and the strategy selection logic. This does NOT include Remotion rendering changes - that's Phase 2.

## Context
Users generate videos with narration audio and visual content (images or videos). The challenge: generated video segments are exactly 10 seconds, but narration audio varies in length (8-12s typically). This causes black screens or gaps.

**Solution**: Two strategies to adjust video timing to match narration duration:
1. **Speed Adjustment** (default): Adjust video playback speed if mismatch ≤20%
2. **Styled Transitions**: Use freeze-fade or crossfade effects for duration mismatches

**Key Principle**: Narration audio is the master timeline. Videos adapt to narration duration.

## Phase 1 Goals
1. Define types and constants
2. Extend project settings schema to include timeline strategy
3. Fix database persistence (timeline column already has strategy, need to preserve it)
4. Add UI controls (project settings + video command bar)
5. Implement strategy selection logic in timeline generation

## Implementation Steps

### Step 1: Define Central Constants & Types

**File**: `client/src/types/types.ts`

**Add constant** (around line 270, near other constants):
```typescript
export const DEFAULT_TIMELINE_ASSEMBLY_STRATEGY: TimelineAssemblyStrategy = "speed-adjustment";
```

**Update VideoConfig schema** (around line 358):
```typescript
export const videoConfigSchema = z.object({
  model: z.string(),
  imageModel: z.string().default(DEFAULT_IMAGE_MODEL),
  resolution: z.enum(videoResolutionValues),
  duration: z.enum(videoDurationSegmentValues),
  timelineAssemblyStrategy: z.enum(timelineAssemblyStrategyValues).optional(),
});
```

**Update DEFAULT_LECTURE_CONFIG** (around line 488):
```typescript
video: {
  model: DEFAULT_VIDEO_MODEL,
  imageModel: DEFAULT_IMAGE_MODEL,
  resolution: "480p",
  duration: "10",
  timelineAssemblyStrategy: DEFAULT_TIMELINE_ASSEMBLY_STRATEGY,
},
```

**Note**: `timelineAssemblyStrategyValues` and `TimelineAssemblyStrategy` type already exist (added earlier)

### Step 2: Project Settings UI (Project-Wide Default)

**File**: `client/src/components/configuration/edit-video-configuration.tsx`

**Add after the "Image Model" dropdown** (after line 113):
```typescript
<div className="space-y-2">
  <Label htmlFor="timelineStrategy">Timeline Assembly Strategy</Label>
  <Select
    value={config.timelineAssemblyStrategy ?? DEFAULT_TIMELINE_ASSEMBLY_STRATEGY}
    onValueChange={(value) => onChange({
      ...config,
      timelineAssemblyStrategy: value as TimelineAssemblyStrategy
    })}
  >
    <SelectTrigger id="timelineStrategy">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="speed-adjustment">Speed Adjustment</SelectItem>
      <SelectItem value="styled-transition">Styled Transitions</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">
    Default strategy for new timelines in this project
  </p>
</div>
```

**Import additions**:
```typescript
import type { TimelineAssemblyStrategy } from "@/types/types";
import { DEFAULT_TIMELINE_ASSEMBLY_STRATEGY } from "@/types/types";
```

**This saves immediately** via existing `updateProjectSettingsAction()` - no additional work needed.

### Step 3: Fix Database Persistence

**File**: `client/src/data/lecture/repository.ts`

**Problem**: The `normaliseLectureContent()` function (lines 93-126) creates a timeline but drops the `assemblyStrategy` field.

**Fix** (around line 108-113):
```typescript
const normalisedTimeline: Timeline = {
  id: rawTimeline?.id ?? "timeline",
  name: rawTimeline?.name ?? "Timeline",
  duration,
  tracks,
  assemblyStrategy: rawTimeline?.assemblyStrategy, // ADD THIS LINE
};
```

**Why**: Timeline is stored as JSON in `video_lectures.timeline` column. When loading from DB, we need to preserve all fields including `assemblyStrategy`.

### Step 4: Video Command Bar Updates

**File**: `client/src/components/video-command-bar.tsx`

**Current state**: Already has strategy dropdown that updates local state

**Changes needed**:
1. Remove any database persistence from `handleStrategyChange()` (verify it's not there)
2. Add "Export" button

**Update the return JSX** (around line 54-91):
```typescript
return (
  <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 mb-4">
    <div className="flex items-center gap-3">
      <Label htmlFor="assembly-strategy" className="text-sm font-medium whitespace-nowrap">
        Assembly Strategy
      </Label>
      <Select
        value={currentStrategy}
        onValueChange={handleStrategyChange}
      >
        <SelectTrigger id="assembly-strategy" className="w-[200px]">
          <SelectValue placeholder="Select strategy" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(strategyLabels) as TimelineAssemblyStrategy[]).map((strategy) => (
            <SelectItem key={strategy} value={strategy}>
              {strategyLabels[strategy]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="flex items-center gap-2">
      <Button
        onClick={handleRegenerate}
        disabled={isPending || isRegenerating}
        variant="secondary"
        size="sm"
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${(isPending || isRegenerating) ? 'animate-spin' : ''}`} />
        {isPending || isRegenerating ? "Regenerating..." : "Regenerate Timeline"}
      </Button>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        variant="secondary"
        size="sm"
      >
        <Download className={`mr-2 h-4 w-4`} />
        Export
      </Button>
    </div>
  </div>
);
```

**Add state and handler**:
```typescript
const [isExporting, setIsExporting] = useState(false);

const handleExport = async () => {
  setIsExporting(true);
  // TODO: Phase 2 - implement export
  console.log("Export video to MP4");
  setTimeout(() => setIsExporting(false), 2000);
};
```

**Add import**:
```typescript
import { RefreshCw, Download } from "lucide-react";
```

### Step 5: Timeline Generation Strategy Selection

**File**: `client/src/inngest/functions/generate-timeline.ts`

**Update the "assemble-timeline" step** (around line 153-181):

**Replace** the strategy reading logic (line 160):
```typescript
const timeline = await step.run("assemble-timeline", async () => {
  const images = preparedLecture.images ?? [];
  const videos = preparedLecture.videos ?? [];
  const narration = preparedLecture.narration ?? [];
  const music = preparedLecture.music ?? [];

  // Get assembly strategy from project settings
  const projectSettings = await getProjectSettings(userId);

  // Priority order:
  // 1. Existing timeline strategy (if regenerating with user override)
  // 2. Project settings (project-wide default)
  // 3. Global default constant
  const strategy =
    preparedLecture.timeline?.assemblyStrategy ??
    projectSettings.video.timelineAssemblyStrategy ??
    DEFAULT_TIMELINE_ASSEMBLY_STRATEGY;

  log.info("Timeline assembly strategy selected", {
    strategy,
    source: preparedLecture.timeline?.assemblyStrategy
      ? "existing-timeline"
      : projectSettings.video.timelineAssemblyStrategy
        ? "project-settings"
        : "default"
  });

  // Assemble timeline using pure function
  const timeline = assembleTimeline({
    images,
    videos,
    narration,
    music,
    runId,
    strategy,
  });

  log.info("Timeline assembled", {
    visualClips: timeline.tracks.visual.length,
    voiceClips: timeline.tracks.voice.length,
    musicClips: timeline.tracks.music.length,
    duration: timeline.duration,
    assemblyStrategy: timeline.assemblyStrategy,
  });

  return timeline;
});
```

**Add imports** (top of file):
```typescript
import { getProjectSettings } from "@/data/project";
import { DEFAULT_TIMELINE_ASSEMBLY_STRATEGY } from "@/types/types";
```

**Why this works**:
- First timeline generation: Uses project settings or default
- Regeneration: Preserves user's choice from command bar (stored in timeline)
- Strategy is saved in timeline JSON automatically by `assembleTimeline()` and `updateLectureContent()`

## Testing Checklist

### Type Safety
- [ ] `pnpm --filter tutopanda-client type-check` passes
- [ ] No hard-coded "speed-adjustment" strings anywhere (use constant)

### Project Settings
- [ ] Can select "Speed Adjustment" in project settings
- [ ] Can select "Styled Transitions" in project settings
- [ ] Settings save immediately to database
- [ ] Settings persist after page reload

### Video Command Bar
- [ ] Strategy dropdown shows current timeline strategy
- [ ] Can change strategy (updates local state only)
- [ ] Regenerate button works
- [ ] Export button shows (doesn't do anything yet)
- [ ] No database writes when changing strategy dropdown

### Timeline Generation
- [ ] First generation uses project settings strategy
- [ ] Regeneration preserves command bar strategy choice
- [ ] Falls back to default if no project/timeline strategy
- [ ] `assemblyStrategy` field saved in timeline JSON
- [ ] Metadata fields on video clips populated (speedAdjustment, transitionType, etc.)
- [ ] Console logs show correct strategy selection and application

### Database
- [ ] Timeline loads with assemblyStrategy preserved
- [ ] Project settings include timelineAssemblyStrategy
- [ ] No database migration needed (JSON columns)

## Files Modified Summary
1. `client/src/types/types.ts` - Constants and schema
2. `client/src/components/configuration/edit-video-configuration.tsx` - Project UI
3. `client/src/components/video-command-bar.tsx` - Command bar UI
4. `client/src/data/lecture/repository.ts` - Preserve strategy field
5. `client/src/inngest/functions/generate-timeline.ts` - Strategy selection logic

## Next Phase
Phase 2 will implement the Remotion rendering changes to actually apply the speed adjustments and transitions during video playback and MP4 export.
