"use client";

import { useEffect, useState } from "react";

// Fetches JSON from one of our API routes while `enabled` is true, and again
// whenever `refreshKey` changes (pass the main data's lastUpdated to refresh in
// step with the 5-minute cycle). Keeps the last good response on error.
// Responses carrying an `error` field (our routes' failure shape) are ignored.
export function useOverlayResponse<R extends object>(url: string, enabled = true, refreshKey?: string): R | null {
  const [response, setResponse] = useState<R | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json && !("error" in json)) setResponse(json);
      })
      .catch((err) => console.error(`Fetch ${url} failed`, err));
    return () => { cancelled = true; };
  }, [url, enabled, refreshKey]);

  return response;
}

const EMPTY: never[] = []; // stable reference so memoised consumers don't recompute

// Convenience for routes returning `{ data: T[] }`.
export function useOverlayData<T>(url: string, enabled = true, refreshKey?: string): T[] {
  const response = useOverlayResponse<{ data?: T[] }>(url, enabled, refreshKey);
  return Array.isArray(response?.data) ? response.data : EMPTY;
}

// A counter that increments every `ms` — combine with refreshKey for panels
// that need to refresh faster than the 5-minute main cycle.
export function useTicker(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}
