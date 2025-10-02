"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

import {
  updateLectureContentAction,
  type UpdateLectureContentActionInput,
} from "@/app/actions/lecture/update-lecture-content";
import { getLectureAction } from "@/app/actions/lecture/get-lecture";
import type { SerializableLectureSnapshot } from "@/data/lecture/repository";
import type { NormalisedLectureContent, Timeline } from "@/types/types";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type { LectureProgressMessage } from "@/inngest/functions/workflow-utils";

const AUTO_SAVE_DELAY_MS = 2000;

type LectureContentKey = keyof NormalisedLectureContent;

type LectureEditorContextValue = {
  lectureId: number;
  projectId: number;
  revision: number;
  updatedAt: Date;
  status: "idle" | "saving" | "error";
  lastError: string | null;
  clearError: () => void;
  content: NormalisedLectureContent;
  timeline: Timeline | null;
  setTimeline: (timeline: Timeline | null) => void;
  updateTimeline: (updater: (timeline: Timeline | null) => Timeline | null) => void;
  saveNow: () => Promise<void>;
};

const LectureEditorContext = createContext<LectureEditorContextValue | null>(null);

export function useLectureEditor() {
  const context = useContext(LectureEditorContext);

  if (!context) {
    throw new Error("useLectureEditor must be used within LectureEditorProvider");
  }

  return context;
}

export function LectureEditorProvider({
  lectureId,
  initialSnapshot,
  children,
}: {
  lectureId: number;
  initialSnapshot: SerializableLectureSnapshot;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<NormalisedLectureContent>(() =>
    snapshotToContent(initialSnapshot)
  );
  const [dirtyFields, setDirtyFields] = useState<Set<LectureContentKey>>(
    () => new Set()
  );
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialSnapshot.revision);
  const [updatedAt, setUpdatedAt] = useState(new Date(initialSnapshot.updatedAt));
  const [projectId] = useState(initialSnapshot.projectId);

  // Subscribe to timeline completion events
  const { data: subscriptionData = [] } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  // Handle timeline completion
  useEffect(() => {
    for (const message of subscriptionData) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;

      if (payload?.type === "timeline-complete" && payload.lectureId === lectureId) {
        console.log("Timeline completed, refreshing lecture data...");

        // Refetch the lecture snapshot
        const refreshLecture = async () => {
          try {
            const snapshot = await getLectureAction(lectureId);
            setDraft(snapshotToContent(snapshot));
            setRevision(snapshot.revision);
            setUpdatedAt(new Date(snapshot.updatedAt));
            setDirtyFields(new Set());
            console.log("Timeline loaded successfully");
          } catch (error) {
            console.error("Failed to refresh lecture after timeline completion", error);
          }
        };

        void refreshLecture();
        break; // Only process once
      }
    }
  }, [subscriptionData, lectureId]);

  const markDirty = useCallback((key: LectureContentKey) => {
    setDirtyFields((prev) => {
      if (prev.has(key)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const setField = useCallback(
    <K extends LectureContentKey>(key: K, value: NormalisedLectureContent[K]) => {
      setDraft((prev) => {
        if (prev[key] === value) {
          return prev;
        }
        markDirty(key);
        return { ...prev, [key]: value } as NormalisedLectureContent;
      });
    },
    [markDirty]
  );

  const updateTimeline = useCallback(
    (updater: (timeline: Timeline | null) => Timeline | null) => {
      setDraft((prev) => {
        const nextTimeline = updater(prev.timeline ?? null);
        if (nextTimeline === prev.timeline) {
          return prev;
        }
        markDirty("timeline");
        return { ...prev, timeline: nextTimeline } as NormalisedLectureContent;
      });
    },
    [markDirty]
  );

  const flushDraft = useCallback(async () => {
    if (dirtyFields.size === 0) {
      return;
    }

    setStatus("saving");

    const payload = Object.fromEntries(
      Array.from(dirtyFields, (key) => [key, draft[key]])
    ) as UpdateLectureContentActionInput["payload"];

    try {
      const snapshot = await updateLectureContentAction({
        lectureId,
        baseRevision: revision,
        payload,
      });

      setStatus("idle");
      setLastError(null);
      setDraft(snapshotToContent(snapshot));
      setRevision(snapshot.revision);
      setUpdatedAt(new Date(snapshot.updatedAt));
      setDirtyFields(new Set());
    } catch (error) {
      console.error("Failed to auto-save lecture", error);
      setStatus("error");
      setLastError(
        error instanceof Error ? error.message : "Failed to auto-save lecture"
      );
    }
  }, [dirtyFields, draft, lectureId, revision]);

  useEffect(() => {
    if (dirtyFields.size === 0 || status === "saving") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void flushDraft();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dirtyFields, draft, status, flushDraft]);

  const contextValue = useMemo<LectureEditorContextValue>(() => ({
    lectureId,
    projectId,
    revision,
    updatedAt,
    status,
    lastError,
    clearError: () => setLastError(null),
    content: draft,
    timeline: draft.timeline,
    setTimeline: (timeline) => setField("timeline", timeline ?? null),
    updateTimeline,
    saveNow: async () => {
      await flushDraft();
    },
  }), [
    lectureId,
    projectId,
    revision,
    updatedAt,
    status,
    lastError,
    draft,
    setField,
    updateTimeline,
    flushDraft,
  ]);

  return (
    <LectureEditorContext.Provider value={contextValue}>
      {children}
    </LectureEditorContext.Provider>
  );
}

const snapshotToContent = (
  snapshot: SerializableLectureSnapshot
): NormalisedLectureContent => ({
  title: snapshot.title,
  summary: snapshot.summary,
  config: snapshot.config ?? null,
  script: snapshot.script ?? null,
  images: snapshot.images ?? [],
  narration: snapshot.narration ?? [],
  music: snapshot.music ?? [],
  effects: snapshot.effects ?? [],
  timeline: snapshot.timeline,
});
