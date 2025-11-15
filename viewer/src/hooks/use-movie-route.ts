import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("popstate", callback);
  };
}

function getSnapshot() {
  return window.location.pathname;
}

function parseMovieId(pathname: string): string | null {
  const match = pathname.match(/^\/movies\/([^/]+)/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
}

export function useMovieRoute(): string | null {
  const pathname = useSyncExternalStore(subscribe, getSnapshot, () => "/");
  return parseMovieId(pathname);
}
