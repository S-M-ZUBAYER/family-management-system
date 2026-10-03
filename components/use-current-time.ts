"use client";

import { useEffect, useState } from "react";

// Time-sensitive lists must not render with two different clocks during hydration.
export function useCurrentTime(): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) setNow(Date.now()); };
    queueMicrotask(refresh);
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}
