"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SoundEffectConfig } from "@/types/types";
import { soundEffectModelOptions } from "@/lib/models";

interface EditSoundEffectsConfigurationProps {
  config: SoundEffectConfig;
  onChange: (config: SoundEffectConfig) => void;
}

export function EditSoundEffectsConfiguration({ config, onChange }: EditSoundEffectsConfigurationProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Sound Effects Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="soundEffectModel">Model</Label>
          <Select
            value={config.model}
            onValueChange={(value) => onChange({ ...config, model: value })}
          >
            <SelectTrigger id="soundEffectModel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {soundEffectModelOptions.map((model) => (
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
