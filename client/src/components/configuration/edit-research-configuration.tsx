"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ResearchConfig } from "@/types/types";
import { reasoningEffortValues, reasoningSummaryValues } from "@/types/types";
import { llmModelOptions } from "@/lib/models";

interface EditResearchConfigurationProps {
  config: ResearchConfig;
  onChange: (config: ResearchConfig) => void;
}

const reasoningEffortLabels: Record<typeof reasoningEffortValues[number], string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const reasoningSummaryLabels: Record<typeof reasoningSummaryValues[number], string> = {
  auto: "Auto",
  concise: "Concise",
  detailed: "Detailed",
};

export function EditResearchConfiguration({ config, onChange }: EditResearchConfigurationProps) {
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-4">Research Settings</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Configure how the AI researches and drafts your lecture content
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Select
            value={config.model}
            onValueChange={(value) => onChange({ ...config, model: value })}
          >
            <SelectTrigger id="model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {llmModelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
          <Select
            value={config.reasoningEffort}
            onValueChange={(value) => onChange({ ...config, reasoningEffort: value as typeof reasoningEffortValues[number] })}
          >
            <SelectTrigger id="reasoningEffort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasoningEffortValues.map((effort) => (
                <SelectItem key={effort} value={effort}>
                  {reasoningEffortLabels[effort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Higher effort provides deeper reasoning but takes longer
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reasoningSummary">Reasoning Summary</Label>
          <Select
            value={config.reasoningSummary}
            onValueChange={(value) => onChange({ ...config, reasoningSummary: value as typeof reasoningSummaryValues[number] })}
          >
            <SelectTrigger id="reasoningSummary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reasoningSummaryValues.map((summary) => (
                <SelectItem key={summary} value={summary}>
                  {reasoningSummaryLabels[summary]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls the level of detail in the reasoning explanation
          </p>
        </div>
      </div>
    </div>
  );
}
