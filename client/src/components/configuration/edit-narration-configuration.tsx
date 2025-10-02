"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { NarrationConfig } from "@/types/types";
import { segmentLengthValues } from "@/types/types";

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

        <div className="space-y-2">
          <Label htmlFor="voice">Voice</Label>
          <Input
            id="voice"
            value={config.voice}
            onChange={(e) => onChange({ ...config, voice: e.target.value })}
            placeholder="Voice ID or name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="narrationModel">Model</Label>
          <Input
            id="narrationModel"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            placeholder="e.g., MiniMax Speech"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="emotion">Emotion (Optional)</Label>
          <Input
            id="emotion"
            value={config.emotion || ""}
            onChange={(e) => onChange({ ...config, emotion: e.target.value })}
            placeholder="e.g., cheerful, serious"
          />
        </div>
      </div>
    </div>
  );
}
