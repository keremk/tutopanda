"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NarrationConfig } from "@/types/types";
import { segmentLengthValues } from "@/types/types";
import NarrationModelConfig from "@/components/narration-model-config";

interface EditNarrationConfigurationProps {
  config: NarrationConfig;
  onChange: (config: NarrationConfig) => void;
}

export function EditNarrationConfiguration({ config, onChange }: EditNarrationConfigurationProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Narration Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="segmentLength">Segment Length</Label>
          <Select
            value={config.segmentLength}
            onValueChange={(value) => onChange({ ...config, segmentLength: value as typeof segmentLengthValues[number] })}
          >
            <SelectTrigger id="segmentLength">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {segmentLengthValues.map((length) => (
                <SelectItem key={length} value={length}>
                  {length}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Duration for each narration segment</p>
        </div>

        <NarrationModelConfig
          model={config.model}
          voice={config.voice}
          emotion={config.emotion}
          onModelChange={(model) => onChange({ ...config, model })}
          onVoiceChange={(voice) => onChange({ ...config, voice })}
          onEmotionChange={(emotion) => onChange({ ...config, emotion })}
        />
      </div>
    </div>
  );
}
