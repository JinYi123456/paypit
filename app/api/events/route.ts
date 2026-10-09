import { startTick } from "@/lib/tick";
import { snapshot, subscribe } from "@/lib/store";
import type { WorldSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  startTick();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (snap: WorldSnapshot) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send(snapshot()); // immediate first frame

      const unsub = subscribe(send);

      // watchdog: keep the loop from dying silently in dev
      const keepalive = setInterval(() => {
        if (closed) clearInterval(keepalive);
      }, 30000);
      keepalive.unref?.();

      return () => {
        closed = true;
        unsub();
        clearInterval(keepalive);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
