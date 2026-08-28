"use client";

import { useEffect } from "react";

type Props = {
  path?: string;
};

export function VisitTracker({ path = "/" }: Props) {
  useEffect(() => {
    const key = `mp_visit:${path}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode etc. */
    }

    void fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }).catch(() => {
      /* ignore */
    });
  }, [path]);

  return null;
}
