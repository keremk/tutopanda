"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VideoConfig } from "@/types/types";
import {
  videoResolutionValues,
  videoResolutionLabels,
  videoDurationSegmentValues,
  videoDurationSegmentLabels,
} from "@/types/types";
import { videoModelOptions, DEFAULT_VIDEO_MODEL } from "@/lib/models";

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

  const modelValue =
    videoModelOptions.find((model) => model.id === config.model)?.id ??
    DEFAULT_VIDEO_MODEL;

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
          <Label htmlFor="videoModel">Model</Label>
          <Select
            value={modelValue}
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
        </div>
      </div>
    </div>
  );
}
