"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Voice configuration for different models
const MINIMAX_VOICES = [
  { id: "male-qn-qingse", name: "Male - Qingse" },
  { id: "female-shaonv", name: "Female - Shaonv" },
  { id: "female-yujie", name: "Female - Yujie" },
  { id: "male-qingse-jingpin", name: "Male - Qingse (Premium)" },
  { id: "female-shaonv-jingpin", name: "Female - Shaonv (Premium)" },
] as const;

const NARRATION_MODELS = [
  { id: "minimax/speech-02-hd", name: "MiniMax Speech HD", supportsEmotion: true },
  { id: "eleven_v3", name: "ElevenLabs V3", supportsEmotion: false },
] as const;

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
  const selectedModel = NARRATION_MODELS.find((m) => m.id === model);
  const isMinimax = model === "minimax/speech-02-hd";

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
            {NARRATION_MODELS.map((m) => (
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
              {MINIMAX_VOICES.map((v) => (
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

// Export for use in other components
export { MINIMAX_VOICES, NARRATION_MODELS };
