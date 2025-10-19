"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type { LectureProgressMessage } from "@/inngest/functions/workflow-utils";
import { useLectureEditor } from "@/components/lecture-editor-provider";
import type { ImageAsset, MusicSettings, NarrationSettings, VideoAsset } from "@/types/types";

type AssetType = "image" | "narration" | "music" | "video";

type PreviewExtractor<TPreview> = (
  message: LectureProgressMessage
) => { preview: TPreview; assetId: string } | null;

export type UseAssetGenerationFlowOptions<TPreview> = {
  assetType: AssetType;
  lectureId: number;
  assetId: string | null;
  onRegenerate: () => Promise<{ runId: string }>;
  onAccept: (runId: string, assetId: string) => Promise<void>;
  onReject: (runId: string, assetId: string) => Promise<void>;
  previewMessageType: LectureProgressMessage["type"];
  completeMessageType: LectureProgressMessage["type"];
  extractPreview: PreviewExtractor<TPreview>;
  mapPreviewToAssetUpdate: (
    preview: TPreview
  ) =>
    | Partial<ImageAsset>
    | Partial<NarrationSettings>
    | Partial<MusicSettings>
    | Partial<VideoAsset>;
  onPreviewAccepted?: (preview: TPreview) => void;
  onPreviewRejected?: () => void;
  refreshOnAccept?: boolean;
  refreshOnComplete?: boolean;
};

export type UseAssetGenerationFlowResult<TPreview> = {
  isGenerating: boolean;
  isReviewOpen: boolean;
  isDecisionPending: boolean;
  error: string | null;
  preview: TPreview | null;
  previewVersion: number;
  runId: string | null;
  startGeneration: () => Promise<void>;
  openReview: () => void;
  closeReview: () => void;
  acceptPreview: () => Promise<void>;
  rejectPreview: () => Promise<void>;
  reset: () => void;
};

export function useAssetGenerationFlow<TPreview>({
  assetType,
  lectureId,
  assetId,
  onRegenerate,
  onAccept,
  onReject,
  previewMessageType,
  completeMessageType,
  extractPreview,
  mapPreviewToAssetUpdate,
  onPreviewAccepted,
  onPreviewRejected,
  refreshOnAccept = true,
  refreshOnComplete = false,
}: UseAssetGenerationFlowOptions<TPreview>): UseAssetGenerationFlowResult<TPreview> {
  const { applyAssetUpdate, refreshLecture } = useLectureEditor();
  const [runId, setRunId] = useState<string | null>(null);
  const [preview, setPreview] = useState<TPreview | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isDecisionPending, setIsDecisionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processedEventKeysRef = useRef<Set<string>>(new Set());

  const { data: subscriptionData = [] } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  const reset = useCallback(() => {
    setRunId(null);
    setPreview(null);
    setPreviewAssetId(null);
    setPreviewVersion((prev) => prev + 1);
    setIsGenerating(false);
    setIsReviewOpen(false);
    setIsDecisionPending(false);
    setError(null);
    processedEventKeysRef.current = new Set();
  }, []);

  useEffect(() => {
    reset();
  }, [assetId, reset]);

  useEffect(() => {
    if (!runId) {
      return;
    }

    for (const message of subscriptionData) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;
      if (!payload || payload.runId !== runId) {
        continue;
      }

      if (payload.type === previewMessageType) {
        const eventKey = `${payload.type}:${payload.runId}:${"timestamp" in payload ? payload.timestamp : ""}`;
        if (processedEventKeysRef.current.has(eventKey)) {
          continue;
        }
        processedEventKeysRef.current.add(eventKey);
        const extracted = extractPreview(payload);
        if (!extracted) {
          continue;
        }

        setPreview(extracted.preview);
        setPreviewAssetId(extracted.assetId);
        setPreviewVersion((prev) => prev + 1);
        setIsGenerating(false);
        setError(null);
        break;
      }

      if (payload.type === completeMessageType) {
        const eventKey = `${payload.type}:${payload.runId}:${"timestamp" in payload ? payload.timestamp : ""}`;
        if (processedEventKeysRef.current.has(eventKey)) {
          continue;
        }
        processedEventKeysRef.current.add(eventKey);
        setIsGenerating(false);
        setIsDecisionPending(false);
        if (refreshOnComplete) {
          refreshLecture({ debounce: false });
        }
        break;
      }

      if (payload.type === "status" && payload.status === "error") {
        const eventKey = `${payload.type}:${payload.runId}:${payload.timestamp}`;
        if (processedEventKeysRef.current.has(eventKey)) {
          continue;
        }
        processedEventKeysRef.current.add(eventKey);
        setError(payload.message);
        setIsGenerating(false);
        setIsDecisionPending(false);
        break;
      }
    }
  }, [subscriptionData, runId, previewMessageType, completeMessageType, extractPreview]);

  const startGeneration = useCallback(async () => {
    if (isGenerating || !assetId) {
      return;
    }

    setError(null);
    setIsGenerating(true);
    setPreview(null);
    setPreviewAssetId(null);

    try {
      const { runId: newRunId } = await onRegenerate();
      setRunId(newRunId);
    } catch (err) {
      console.error("Failed to start asset regeneration", err);
      setError("Failed to start generation. Please try again.");
      setIsGenerating(false);
    }
  }, [assetId, isGenerating, onRegenerate]);

  const acceptPreview = useCallback(async () => {
    if (!runId || !preview || !previewAssetId) {
      return;
    }

    setError(null);
    setIsDecisionPending(true);

    try {
      await onAccept(runId, previewAssetId);

      const assetUpdate = mapPreviewToAssetUpdate(preview);
      applyAssetUpdate(assetType, previewAssetId, assetUpdate);

      if (refreshOnAccept) {
        refreshLecture();
      }
      onPreviewAccepted?.(preview);
      reset();
    } catch (err) {
      console.error("Failed to accept asset", err);
      setError("Failed to accept. Please try again.");
      setIsDecisionPending(false);
    }
  }, [
    runId,
    preview,
    previewAssetId,
    onAccept,
    applyAssetUpdate,
    assetType,
    reset,
    mapPreviewToAssetUpdate,
    refreshLecture,
    onPreviewAccepted,
  ]);

  const rejectPreview = useCallback(async () => {
    if (!runId || !previewAssetId) {
      return;
    }

    setError(null);
    setIsDecisionPending(true);

    try {
      await onReject(runId, previewAssetId);

      processedEventKeysRef.current = new Set();
      setRunId(null);
      setPreview(null);
      setPreviewAssetId(null);
      setIsReviewOpen(false);
      setIsDecisionPending(false);
      setIsGenerating(false);
      setPreviewVersion((prev) => prev + 1);
      setError(null);
      onPreviewRejected?.();
    } catch (err) {
      console.error("Failed to reject asset", err);
      setError("Failed to reject. Please try again.");
      setIsDecisionPending(false);
    }
  }, [runId, previewAssetId, onReject, onPreviewRejected]);

  const openReview = useCallback(() => {
    if (preview) {
      setIsReviewOpen(true);
    }
  }, [preview]);

  const closeReview = useCallback(() => {
    setIsReviewOpen(false);
  }, []);

  return useMemo(
    () => ({
      isGenerating,
      isReviewOpen,
      isDecisionPending,
      error,
      preview,
      previewVersion,
      runId,
      startGeneration,
      openReview,
      closeReview,
      acceptPreview,
      rejectPreview,
      reset,
    }),
    [
      isGenerating,
      isReviewOpen,
      isDecisionPending,
      error,
      preview,
      previewVersion,
      runId,
      startGeneration,
      openReview,
      closeReview,
      acceptPreview,
      rejectPreview,
      reset,
    ]
  );
}
