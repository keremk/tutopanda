"use client";

import { useState, useTransition } from "react";
import EditConfiguration from "@/components/edit-configuration";
import { updateProjectSettingsAction } from "@/app/actions/update-project-settings";
import { useToast } from "@/hooks/use-toast";
import type { LectureConfig } from "@/types/types";

interface SettingsPageContentProps {
  settings: LectureConfig;
}

export function SettingsPageContent({ settings }: SettingsPageContentProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleSave = (config: LectureConfig) => {
    startTransition(() => {
      updateProjectSettingsAction({ settings: config })
        .then(() => {
          toast({
            title: "Settings saved",
            description: "Your default configuration has been updated.",
          });
        })
        .catch((error) => {
          console.error("Failed to save settings", error);
          toast({
            title: "Something went wrong",
            description: "We couldn't save your settings. Please try again.",
            variant: "destructive",
          });
        });
    });
  };

  return (
    <div className="flex h-full flex-col p-6">
      <EditConfiguration
        config={settings}
        runId={null}
        isEditMode={false}
        onSave={handleSave}
      />
    </div>
  );
}
