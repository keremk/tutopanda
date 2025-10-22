"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VideoConfig, TimelineAssemblyStrategy } from "@/types/types";
import {
  videoResolutionValues,
  videoResolutionLabels,
  videoDurationSegmentValues,
  videoDurationSegmentLabels,
  DEFAULT_TIMELINE_ASSEMBLY_STRATEGY,
} from "@/types/types";
import { videoModelOptions, imageModelOptions } from "@/lib/models";

interface EditVideoConfigurationProps {
  config: VideoConfig;
  onChange: (config: VideoConfig) => void;
}

export function EditVideoConfiguration({ config, onChange }: EditVideoConfigurationProps) {
  const resolutionValue =
    videoResolutionValues.find((value) => value === config.resolution) ??
    videoResolutionValues[0];

  const durationValue =
    videoDurationSegmentValues.find((value) => value === config.duration) ??
    videoDurationSegmentValues[0];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Video Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="videoResolution">Resolution</Label>
          <Select
            value={resolutionValue}
            onValueChange={(value) => onChange({ ...config, resolution: value as typeof videoResolutionValues[number] })}
          >
            <SelectTrigger id="videoResolution">
              <SelectValue placeholder={videoResolutionLabels[resolutionValue]} />
            </SelectTrigger>
            <SelectContent>
              {videoResolutionValues.map((resolution) => (
                <SelectItem key={resolution} value={resolution}>
                  {videoResolutionLabels[resolution]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Video resolution quality</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="videoDuration">Duration</Label>
          <Select
            value={durationValue}
            onValueChange={(value) => onChange({ ...config, duration: value as typeof videoDurationSegmentValues[number] })}
          >
            <SelectTrigger id="videoDuration">
              <SelectValue placeholder={videoDurationSegmentLabels[durationValue]} />
            </SelectTrigger>
            <SelectContent>
              {videoDurationSegmentValues.map((duration) => (
                <SelectItem key={duration} value={duration}>
                  {videoDurationSegmentLabels[duration]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Duration per video segment</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="videoModel">Video Model</Label>
          <Select
            value={config.model}
            onValueChange={(value) => onChange({ ...config, model: value })}
          >
            <SelectTrigger id="videoModel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {videoModelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Used for generating motion in each video segment.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="videoImageModel">Image Model</Label>
          <Select
            value={config.imageModel}
            onValueChange={(value) => onChange({ ...config, imageModel: value })}
          >
            <SelectTrigger id="videoImageModel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageModelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Used for generating starting or ending images.</p>
        </div>

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
          <p className="text-xs text-muted-foreground">Default strategy for new timelines in this project</p>
        </div>
      </div>
    </div>
  );
}
