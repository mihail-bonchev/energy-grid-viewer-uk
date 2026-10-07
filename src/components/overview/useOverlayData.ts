"use client";

import { useEffect, useState } from "react";

// Fetches `{ data: T[] }` from one of our API routes while `enabled` is true,
// and again whenever `refreshKey` changes (pass the main data's lastUpdated to
// refresh in step with the 5-minute cycle). Keeps the last good data on error.
export function useOverlayData<T>(url: string, enabled = true, refreshKey?: string): T[] {
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && Array.isArray(json?.data)) setData(json.data);
      })
      .catch((err) => console.error(`Fetch ${url} failed`, err));
    return () => { cancelled = true; };
  }, [url, enabled, refreshKey]);

  return data;
}
