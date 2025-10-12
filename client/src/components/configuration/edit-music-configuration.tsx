"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MusicConfig } from "@/types/types";
import { musicModelOptions } from "@/lib/models";

interface EditMusicConfigurationProps {
  config: MusicConfig;
  onChange: (config: MusicConfig) => void;
}

export function EditMusicConfiguration({ config, onChange }: EditMusicConfigurationProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Background Music Settings</h4>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="musicModel">Model</Label>
          <Select
            value={config.model}
            onValueChange={(value) => onChange({ ...config, model: value })}
          >
            <SelectTrigger id="musicModel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {musicModelOptions.map((model) => (
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
