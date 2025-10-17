"use client";

import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getNarrationModelDefinition,
  getVoiceOptionsForNarrationModel,
  narrationModelOptions,
  type NarrationVoiceOption,
} from "@/lib/models";

interface NarrationModelConfigProps {
  model: string;
  voice: string;
  emotion?: string;
  language?: string;
  onModelChange: (model: string) => void;
  onVoiceChange: (voice: string) => void;
  onEmotionChange?: (emotion: string) => void;
}

export default function NarrationModelConfig({
  model,
  voice,
  emotion = "",
  language,
  onModelChange,
  onVoiceChange,
  onEmotionChange,
}: NarrationModelConfigProps) {
  const modelDefinition = getNarrationModelDefinition(model);
  const voiceSelection = modelDefinition?.voiceSelection;
  const supportsEmotion = Boolean(modelDefinition?.supportsEmotion);

  const voiceOptions = useMemo<readonly NarrationVoiceOption[]>(() => {
    if (voiceSelection?.type !== "preset") {
      return [];
    }
    return getVoiceOptionsForNarrationModel(model, language);
  }, [language, model, voiceSelection]);

  const selectedVoiceOption = useMemo(
    () => voiceOptions.find((option) => option.id === voice),
    [voiceOptions, voice]
  );

  useEffect(() => {
    if (voiceSelection?.type !== "preset" || voiceOptions.length === 0) {
      return;
    }

    const hasVoice = voiceOptions.some((option) => option.id === voice);
    if (!hasVoice) {
      const fallbackVoice = voiceSelection.defaultVoiceId ?? voiceOptions[0]?.id;
      if (fallbackVoice) {
        onVoiceChange(fallbackVoice);
      }
    }
  }, [onVoiceChange, voice, voiceOptions, voiceSelection]);

  const voiceLabel =
    voiceSelection?.label ??
    (voiceSelection?.type === "custom" ? "Voice ID" : "Voice");

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
      {voiceSelection?.type === "preset" ? (
        <div className="space-y-2">
          <Label htmlFor="voice">{voiceLabel}</Label>
          <Select value={voice} onValueChange={onVoiceChange}>
            <SelectTrigger id="voice">
              <SelectValue placeholder="Select a voice...">
                {selectedVoiceOption?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {voiceOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="voice">{voiceLabel}</Label>
          <Input
            id="voice"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            placeholder={voiceSelection?.type === "custom" ? voiceSelection.placeholder ?? "Voice ID" : "Voice ID or name"}
          />
          {voiceSelection?.type === "custom" && voiceSelection.helperText ? (
            <p className="text-xs text-muted-foreground">{voiceSelection.helperText}</p>
          ) : null}
        </div>
      )}

      {/* Emotion Field - Only for models that support it */}
      {supportsEmotion && onEmotionChange && (
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
