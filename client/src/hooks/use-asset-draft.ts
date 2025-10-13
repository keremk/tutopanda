"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const shallowEqual = <T extends Record<string, unknown>>(a: T, b: T) => {
  if (a === b) {
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => a[key] === b[key]);
};

export type UseAssetDraftOptions<TDraft extends Record<string, unknown>> = {
  assetId: string | null;
  baseDraft: TDraft;
};

export type UseAssetDraftResult<TDraft extends Record<string, unknown>> = {
  draft: TDraft;
  setDraft: Dispatch<SetStateAction<TDraft>>;
  baseline: TDraft;
  hasChanges: boolean;
  resetToBaseline: () => void;
  applyPreview: (changes: Partial<TDraft>) => void;
};

export function useAssetDraft<TDraft extends Record<string, unknown>>({
  assetId,
  baseDraft,
}: UseAssetDraftOptions<TDraft>): UseAssetDraftResult<TDraft> {
  const [baseline, setBaseline] = useState<TDraft>(baseDraft);
  const [draft, setDraft] = useState<TDraft>(baseDraft);

  useEffect(() => {
    setBaseline(baseDraft);
    setDraft(baseDraft);
  }, [assetId, baseDraft]);

  const resetToBaseline = useCallback(() => {
    setDraft(baseline);
  }, [baseline]);

  const applyPreview = useCallback((changes: Partial<TDraft>) => {
    setBaseline((prev) => ({ ...prev, ...changes } as TDraft));
    setDraft((prev) => ({ ...prev, ...changes } as TDraft));
  }, []);

  const hasChanges = useMemo(() => !shallowEqual(draft, baseline), [draft, baseline]);

  return {
    draft,
    setDraft,
    baseline,
    hasChanges,
    resetToBaseline,
    applyPreview,
  };
}
