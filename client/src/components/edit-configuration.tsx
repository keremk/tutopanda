"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  LectureConfig,
  GeneralConfig,
  ResearchConfig,
  ImageConfig,
  VideoConfig,
  NarrationConfig,
  MusicConfig,
  SoundEffectConfig,
} from "@/types/types";
import { DEFAULT_LECTURE_CONFIG } from "@/types/types";
import { EditGeneralConfiguration } from "./configuration/edit-general-configuration";
import { EditResearchConfiguration } from "./configuration/edit-research-configuration";
import { EditImageConfiguration } from "./configuration/edit-image-configuration";
import { EditVideoConfiguration } from "./configuration/edit-video-configuration";
import { EditNarrationConfiguration } from "./configuration/edit-narration-configuration";
import { EditMusicConfiguration } from "./configuration/edit-music-configuration";
import { EditSoundEffectsConfiguration } from "./configuration/edit-sound-effects-configuration";

interface EditConfigurationProps {
  config: LectureConfig | null;
  runId: string | null;
  isEditMode?: boolean;
  onSave?: (config: LectureConfig) => void;
  onConfigEditComplete?: (runId: string, config: LectureConfig) => void;
}

type ConfigSection = "general" | "research" | "image" | "video" | "narration" | "music" | "effects";

const sections: { id: ConfigSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "research", label: "Research" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "narration", label: "Narration" },
  { id: "music", label: "Music" },
  { id: "effects", label: "Sound Effects" },
];

export default function EditConfiguration({
  config,
  runId,
  isEditMode = false,
  onSave,
  onConfigEditComplete,
}: EditConfigurationProps) {
  const [activeSection, setActiveSection] = useState<ConfigSection>("general");

  // Ensure config has research section (for migration from older configs)
  const normalizeConfig = (cfg: LectureConfig | null): LectureConfig | null => {
    if (!cfg) return null;
    return {
      ...cfg,
      general: cfg.general ?? DEFAULT_LECTURE_CONFIG.general,
      research: cfg.research ?? DEFAULT_LECTURE_CONFIG.research,
    };
  };

  const [editedConfig, setEditedConfig] = useState<LectureConfig | null>(normalizeConfig(config));

  // Sync editedConfig when config prop changes (e.g., when user clicks Edit in agent progress)
  useEffect(() => {
    setEditedConfig(normalizeConfig(config));
  }, [config]);

  const handleAction = () => {
    if (!editedConfig) return;

    if (isEditMode && runId) {
      onConfigEditComplete?.(runId, editedConfig);
    } else {
      onSave?.(editedConfig);
    }
  };

  if (!config || !editedConfig) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
        <p className="text-sm text-muted-foreground">No configuration available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header with action button */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Configuration</h3>
          <p className="text-xs text-muted-foreground">
            Customize your lecture generation settings
          </p>
        </div>
        <Button onClick={handleAction}>
          {isEditMode ? "Edit and Continue" : "Save"}
        </Button>
      </div>

      {/* Main content area with sidebar */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 flex-none">
          <div className="rounded-lg border bg-muted/30 p-2">
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                    activeSection === section.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-muted/30">
          <ScrollArea className="h-full w-full">
            <div className="p-6">
              {activeSection === "general" && (
                <EditGeneralConfiguration
                  config={editedConfig.general}
                  onChange={(general: GeneralConfig) => setEditedConfig({ ...editedConfig, general })}
                />
              )}
              {activeSection === "research" && (
                <EditResearchConfiguration
                  config={editedConfig.research}
                  onChange={(research: ResearchConfig) => setEditedConfig({ ...editedConfig, research })}
                />
              )}
              {activeSection === "image" && (
                <EditImageConfiguration
                  config={editedConfig.image}
                  onChange={(image: ImageConfig) => setEditedConfig({ ...editedConfig, image })}
                />
              )}
              {activeSection === "video" && (
                <EditVideoConfiguration
                  config={editedConfig.video}
                  onChange={(video: VideoConfig) => setEditedConfig({ ...editedConfig, video })}
                />
              )}
              {activeSection === "narration" && (
                <EditNarrationConfiguration
                  config={editedConfig.narration}
                  onChange={(narration: NarrationConfig) => setEditedConfig({ ...editedConfig, narration })}
                />
              )}
              {activeSection === "music" && (
                <EditMusicConfiguration
                  config={editedConfig.music}
                  onChange={(music: MusicConfig) => setEditedConfig({ ...editedConfig, music })}
                />
              )}
              {activeSection === "effects" && (
                <EditSoundEffectsConfiguration
                  config={editedConfig.soundEffects}
                  onChange={(soundEffects: SoundEffectConfig) => setEditedConfig({ ...editedConfig, soundEffects })}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
