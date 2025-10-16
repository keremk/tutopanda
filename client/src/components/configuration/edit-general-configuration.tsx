"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { GeneralConfig } from "@/types/types";
import {
  audienceValues,
  languageLabels,
  languageValues,
  videoDurationLabels,
  videoDurationValues,
} from "@/types/types";

interface EditGeneralConfigurationProps {
  config: GeneralConfig;
  onChange: (config: GeneralConfig) => void;
}

export function EditGeneralConfiguration({ config, onChange }: EditGeneralConfigurationProps) {
  const durationValue =
    videoDurationValues.find((value) => value === String(config.duration)) ??
    videoDurationValues[0];

  const languageValue =
    languageValues.find((value) => value === config.language) ?? languageValues[0];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">General Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="duration">Duration</Label>
          <Select
            value={durationValue}
            onValueChange={(value) => onChange({ ...config, duration: value as typeof videoDurationValues[number] })}
          >
            <SelectTrigger id="duration">
              <SelectValue placeholder={videoDurationLabels[durationValue]} />
            </SelectTrigger>
            <SelectContent>
              {videoDurationValues.map((duration) => (
                <SelectItem key={duration} value={duration}>
                  {videoDurationLabels[duration]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audience">Audience</Label>
          <Select
            value={config.audience}
            onValueChange={(value) => onChange({ ...config, audience: value as typeof audienceValues[number] })}
          >
            <SelectTrigger id="audience">
              <SelectValue placeholder={config.audience} />
            </SelectTrigger>
            <SelectContent>
              {audienceValues.map((audience) => (
                <SelectItem key={audience} value={audience}>
                  {audience}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Language</Label>
          <Select
            value={languageValue}
            onValueChange={(value) =>
              onChange({ ...config, language: value as (typeof languageValues)[number] })
            }
          >
            <SelectTrigger id="language">
              <SelectValue placeholder={languageLabels[languageValue]} />
            </SelectTrigger>
            <SelectContent>
              {languageValues.map((language) => (
                <SelectItem key={language} value={language}>
                  {languageLabels[language]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="useSubtitles">Use Subtitles</Label>
            <p className="text-xs text-muted-foreground">Enable subtitles for the lecture</p>
          </div>
          <Switch
            id="useSubtitles"
            checked={config.useSubtitles}
            onCheckedChange={(checked) => onChange({ ...config, useSubtitles: checked })}
          />
        </div>

        {config.useSubtitles && (
          <div className="space-y-2">
            <Label htmlFor="subtitleLanguage">Subtitle Language</Label>
            <Input
              id="subtitleLanguage"
              value={config.subtitleLanguage || ""}
              onChange={(e) => onChange({ ...config, subtitleLanguage: e.target.value })}
              placeholder="e.g., en"
            />
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="useVideo">Use Video</Label>
            <p className="text-xs text-muted-foreground">Generate video segments (more expensive)</p>
          </div>
          <Switch
            id="useVideo"
            checked={config.useVideo}
            onCheckedChange={(checked) => onChange({ ...config, useVideo: checked })}
          />
        </div>

      </div>
    </div>
  );
}
