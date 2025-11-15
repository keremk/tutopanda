import { startTransition, useEffect, useState } from "react";
import { fetchTimeline } from "@/data/client";
import type { TimelineDocument } from "@/types/timeline";

type Status = "idle" | "loading" | "success" | "error";

interface TimelineState {
  timeline: TimelineDocument | null;
  status: Status;
  error: Error | null;
}

const idleState: TimelineState = {
  timeline: null,
  status: "idle",
  error: null,
};

export function useMovieTimeline(movieId: string | null): TimelineState {
  const [state, setState] = useState<TimelineState>(idleState);

  useEffect(() => {
    if (!movieId) {
      return;
    }

    let cancelled = false;

    startTransition(() => {
      setState((prev) => ({
        ...prev,
        status: "loading",
        error: null,
      }));
    });

    fetchTimeline(movieId)
      .then((data) => {
        if (cancelled) return;
        startTransition(() => {
          setState({
            timeline: data,
            status: "success",
            error: null,
          });
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        startTransition(() => {
          setState({
            timeline: null,
            status: "error",
            error: err,
          });
        });
      });

    return () => {
      cancelled = true;
    };
  }, [movieId]);

  return movieId ? state : idleState;
}
