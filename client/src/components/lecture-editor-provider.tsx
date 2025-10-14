"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

import { updateLectureContentAction } from "@/app/actions/lecture/update-lecture-content";
import type { UpdateLectureContentActionInput } from "@/app/actions/lecture/types";
import { getLectureAction } from "@/app/actions/lecture/get-lecture";
import type { SerializableLectureSnapshot } from "@/data/lecture/repository";
import type {
  NormalisedLectureContent,
  Timeline,
  LectureConfig,
  ImageAsset,
  NarrationSettings,
  MusicSettings,
} from "@/types/types";
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
  projectSettings: LectureConfig;
  timeline: Timeline | null;
  setTimeline: (timeline: Timeline | null) => void;
  updateTimeline: (updater: (timeline: Timeline | null) => Timeline | null) => void;
  saveNow: () => Promise<void>;
  applyAssetUpdate: (
    type: "image" | "narration" | "music",
    assetId: string,
    payload: Partial<ImageAsset> | Partial<NarrationSettings> | Partial<MusicSettings>
  ) => void;
  refreshLecture: (options?: { debounce?: boolean }) => Promise<void> | void;
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
  projectSettings,
  children,
}: {
  lectureId: number;
  initialSnapshot: SerializableLectureSnapshot;
  projectSettings: LectureConfig;
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
  const refreshTimeoutRef = useRef<number | null>(null);

  const fetchLatestLecture = useCallback(async () => {
    try {
      const snapshot = await getLectureAction(lectureId);
      setDraft(snapshotToContent(snapshot));
      setRevision(snapshot.revision);
      setUpdatedAt(new Date(snapshot.updatedAt));
      setDirtyFields(new Set());
      setLastError(null);
    } catch (error) {
      console.error("Failed to refresh lecture data", error);
    }
  }, [lectureId]);

  const refreshLecture = useCallback(
    (options?: { debounce?: boolean }) => {
      const debounce = options?.debounce ?? true;

      if (!debounce) {
        if (refreshTimeoutRef.current) {
          window.clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
        return fetchLatestLecture();
      }

      if (refreshTimeoutRef.current) {
        return;
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void fetchLatestLecture();
      }, 150);
    },
    [fetchLatestLecture]
  );

  // Subscribe to timeline completion events
  const { data: subscriptionData = [] } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  const processedEventsRef = useRef<Set<string>>(new Set());

  // Handle completion events that require lecture refresh
  useEffect(() => {
    for (const message of subscriptionData) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;
      if (!payload) {
        continue;
      }

      const isLectureMatch =
        "lectureId" in payload ? payload.lectureId === lectureId : true;

      if (!isLectureMatch) {
        continue;
      }

      const timestamp = "timestamp" in payload ? payload.timestamp : undefined;
      const eventKey = `${payload.type}:${"runId" in payload ? payload.runId : lectureId}:${timestamp ?? ""}`;

      if (processedEventsRef.current.has(eventKey)) {
        continue;
      }

      if (payload.type === "timeline-complete") {
        processedEventsRef.current.add(eventKey);
        void refreshLecture({ debounce: false });
        break;
      }

      if (
        payload.type === "image-complete" ||
        payload.type === "narration-complete" ||
        payload.type === "music-complete"
      ) {
        processedEventsRef.current.add(eventKey);
        refreshLecture();
        break;
      }
    }
  }, [subscriptionData, lectureId, refreshLecture]);

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

  const applyAssetUpdate = useCallback<
    LectureEditorContextValue["applyAssetUpdate"]
  >((type, assetId, payload) => {
    setDraft((prev) => {
      const key =
        type === "image"
          ? "images"
          : type === "narration"
            ? "narration"
            : "music";

      const items = prev[key];
      if (!items) {
        return prev;
      }

      const index = items.findIndex((item) => item.id === assetId);
      if (index === -1) {
        return prev;
      }

      const currentItem = items[index];
      const nextItem = { ...currentItem, ...(payload as object) };

      const isUnchanged = Object.keys(payload).every(
        (key) => (currentItem as any)[key] === (nextItem as any)[key]
      );

      if (isUnchanged) {
        return prev;
      }

      const nextItems = [...items];
      nextItems[index] = nextItem as (typeof items)[number];

      return {
        ...prev,
        [key]: nextItems,
      } as NormalisedLectureContent;
    });

    setUpdatedAt(new Date());
  }, []);

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

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  const contextValue = useMemo<LectureEditorContextValue>(() => ({
    lectureId,
    projectId,
    revision,
    updatedAt,
    status,
    lastError,
    clearError: () => setLastError(null),
    content: draft,
    projectSettings,
    timeline: draft.timeline,
    setTimeline: (timeline) => setField("timeline", timeline ?? null),
    updateTimeline,
    saveNow: async () => {
      await flushDraft();
    },
    applyAssetUpdate,
    refreshLecture,
  }), [
    lectureId,
    projectId,
    revision,
    updatedAt,
    status,
    lastError,
    draft,
    projectSettings,
    setField,
    updateTimeline,
    flushDraft,
    applyAssetUpdate,
    refreshLecture,
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
  script: snapshot.script ?? null,
  images: snapshot.images ?? [],
  narration: snapshot.narration ?? [],
  music: snapshot.music ?? [],
  effects: snapshot.effects ?? [],
  timeline: snapshot.timeline,
});
