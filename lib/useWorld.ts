"use client";

import { useEffect, useState } from "react";
import type { WorldSnapshot } from "@/lib/types";

export function useWorld(): WorldSnapshot | null {
  const [world, setWorld] = useState<WorldSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const hydrate = () => {
      fetch("/api/roster")
        .then((r) => r.json())
        .then((j: WorldSnapshot) => {
          if (alive) setWorld(j);
        })
        .catch(() => {});
    };

    const connect = () => {
      if (!alive) return;
      es = new EventSource("/api/events");
      es.onmessage = (ev) => {
        try {
          const snap = JSON.parse(ev.data) as WorldSnapshot;
          if (alive) setWorld(snap);
        } catch {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (alive && !retry) retry = setTimeout(() => { retry = null; connect(); }, 2500);
      };
    };

    hydrate();
    connect();

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);

  return world;
}
