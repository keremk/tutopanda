import type { TimelineDocument } from "@/types/timeline";

const API_BASE = "/viewer-api";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function fetchTimeline(movieId: string): Promise<TimelineDocument> {
  return fetchJson<TimelineDocument>(`${API_BASE}/movies/${encodeURIComponent(movieId)}/timeline`);
}

export function buildAssetUrl(movieId: string, canonicalId: string): string {
  return `${API_BASE}/movies/${encodeURIComponent(movieId)}/assets/${encodeURIComponent(canonicalId)}`;
}
