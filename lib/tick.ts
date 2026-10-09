// Heartbeat of the pit: drives agent negotiation ticks, job deliveries,
// cash-outs and job spawns. Started lazily on first access.

import { cashOut, collectBids, ensureSeeded, jobDelivered, payUnclaimedJobs, spawnJob, tick } from "./engine";
import type { Job, WorldSnapshot } from "./types";

interface TimerBox {
  timer: NodeJS.Timeout | null;
  busy: boolean;
}

const g = globalThis as unknown as { __paypitTimer?: TimerBox };

async function tickOnce(): Promise<void> {
  const box: TimerBox = g.__paypitTimer!;
  if (box.busy) return;
  box.busy = true;
  try {
    ensureSeeded();
    const snap: WorldSnapshot | null = await tick();
    if (!snap) return;
    const { snapshot } = await import("./store");
    const s = snapshot();

    const awaiting = s.jobs.filter((x: Job) => x.status === "awaiting-payment").length;
    if (Math.random() < 0.02 && awaiting < 2) void spawnJob();

    // a want with no offers yet — including one the human just published —
    // gets the floor bidding on it right away
    const stranded = s.jobs.find(
      (j: Job) => j.status === "bidding" && j.bids.length === 0 && Date.now() - j.at > 1200,
    );
    if (stranded) void collectBids(stranded.id);

    await payUnclaimedJobs();

    for (const j of s.jobs.filter((j2: Job) => j2.status === "paid").slice(0, 1)) {
      if (Math.random() < 0.7) await jobDelivered(j.id);
    }
    const rich = s.agents.filter((a) => !a.human && a.walletCents > 45000)[0];
    if (rich && Math.random() < 0.08) {
      await cashOut(rich.id);
    }
  } finally {
    box.busy = false;
  }
}

export function startTick(): void {
  if (g.__paypitTimer?.timer) return;
  ensureSeeded();
  g.__paypitTimer = {
    timer: setInterval(() => {
      void tickOnce();
    }, 2800),
    busy: false,
  };
  const timer = g.__paypitTimer.timer;
  if (timer && timer.unref) timer.unref();
}
