"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { minimaxVoiceOptions, narrationModelOptions, isMiniMaxModel } from "@/lib/models";

interface NarrationModelConfigProps {
  model: string;
  voice: string;
  emotion?: string;
  onModelChange: (model: string) => void;
  onVoiceChange: (voice: string) => void;
  onEmotionChange?: (emotion: string) => void;
}

export default function NarrationModelConfig({
  model,
  voice,
  emotion = "",
  onModelChange,
  onVoiceChange,
  onEmotionChange,
}: NarrationModelConfigProps) {
  const selectedModel = narrationModelOptions.find((m) => m.id === model);
  const isMinimax = isMiniMaxModel(model);

  return (
    <div className="space-y-4">
      {/* Model Selector */}
      <div className="space-y-2">
        <Label htmlFor="narrationModel">Model</Label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger id="narrationModel">
            <SelectValue placeholder="Select a model..." />
          </SelectTrigger>
          <SelectContent>
            {narrationModelOptions.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Selector - Dynamic based on model */}
      {isMinimax ? (
        <div className="space-y-2">
          <Label htmlFor="voice">Voice</Label>
          <Select value={voice} onValueChange={onVoiceChange}>
            <SelectTrigger id="voice">
              <SelectValue placeholder="Select a voice..." />
            </SelectTrigger>
            <SelectContent>
              {minimaxVoiceOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="voice">Voice ID</Label>
          <Input
            id="voice"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            placeholder="Voice ID or name"
          />
        </div>
      )}

      {/* Emotion Field - Only for models that support it */}
      {selectedModel?.supportsEmotion && onEmotionChange && (
        <div className="space-y-2">
          <Label htmlFor="emotion">Emotion (Optional)</Label>
          <Input
            id="emotion"
            value={emotion}
            onChange={(e) => onEmotionChange(e.target.value)}
            placeholder="e.g., cheerful, serious, neutral"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for neutral tone
          </p>
        </div>
      )}
    </div>
  );
}
