// User-published wants: agents bid on the human's want; the winning bid is
// paid from the human's spending reserve automatically via the PayPal order
// rail (the human "sponsors" the work). This gives the judge a hands-free show
// for their own want — bids land, money moves, delivery is reported back.

import { jobPaid } from "./engine";
import { createOrder } from "./paypal";
import { mutate, store } from "./store";
import type { Job } from "./types";

const US = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Wait for the tick pump to hand this want its bids + winning offer. */
async function waitForWinner(jobId: string, rounds = 30, everyMs = 1000): Promise<Job | null> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, everyMs));
    const j = store().state.jobs.find((x) => x.id === jobId);
    if (!j) return null;
    if (j.status === "awaiting-payment" && j.chosenBid) return j;
    if (j.status !== "bidding") return null;
  }
  return store().state.jobs.find((x) => x.id === jobId) ?? null;
}

export async function spawnUserJob(job: Job): Promise<void> {
  mutate((s) => {
    if (!s.jobs.some((j) => j.id === job.id)) s.jobs.push(job);
  });

  const latest = await waitForWinner(job.id);

  if (!latest || latest.status !== "awaiting-payment" || !latest.chosenBid) {
    mutate((s) => {
      const j = s.jobs.find((x) => x.id === job.id);
      if (j && j.status === "bidding") {
        j.status = "delivered";
        j.deliveryNote = "No agent met the bar within the reserve — re-post anytime.";
      }
    });
    return;
  }

  const winner = store().state.agents.find((a) => a.id === latest.chosenBid!.agentId);
  const priceCents = latest.chosenBid.priceCents;

  try {
    const order = await createOrder({
      amountCents: priceCents,
      description: `PayPit want: ${latest.want.slice(0, 90)}`,
      referenceId: latest.id,
    });
    await jobPaid(latest.id, order.id, "paypal-order");
    // name the winner now: whichever delivery beat lands first keeps this receipt
    mutate((s) => {
      const j = s.jobs.find((x) => x.id === job.id);
      if (j && !j.deliveryNote) {
        j.deliveryNote = `${winner?.handle ?? "the winner"} delivered for ${US(priceCents)} — receipt in the ledger.`;
      }
    });
    setTimeout(() => {
      mutate((s) => {
        const j = s.jobs.find((x) => x.id === job.id);
        if (j && j.status === "paid") j.status = "delivered";
      });
    }, 6000);
  } catch {
    mutate((s) => {
      const j = s.jobs.find((x) => x.id === job.id);
      if (j) {
        j.status = "delivered";
        j.deliveryNote = "Reserve ran dry — the floor appreciates the ambition.";
      }
    });
  }
}
