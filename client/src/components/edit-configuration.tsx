"use client";

import { Button } from "@/components/ui/button";
import type { LectureConfig } from "@/types/types";

interface EditConfigurationProps {
  config: LectureConfig | null;
  runId: string | null;
  isEditMode?: boolean;
  onSave?: (config: LectureConfig) => void;
  onEditAndContinue?: (runId: string, config: LectureConfig) => void;
}

export default function EditConfiguration({
  config,
  runId,
  isEditMode = false,
  onSave,
  onEditAndContinue,
}: EditConfigurationProps) {
  const handleAction = () => {
    if (!config) return;

    if (isEditMode && runId) {
      onEditAndContinue?.(runId, config);
    } else {
      onSave?.(config);
    }
  };

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No configuration available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Configuration Editor</h2>
            <p className="text-sm text-muted-foreground">
              Configure your lecture settings
            </p>
          </div>

          {/* Placeholder for configuration form */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">
              Configuration editor UI will be implemented here
            </p>
          </div>
        </div>
      </div>

      <div className="flex-none border-t border-border pt-4">
        <Button onClick={handleAction} className="w-full">
          {isEditMode ? "Edit and Continue" : "Save"}
        </Button>
      </div>
    </div>
  );
}
