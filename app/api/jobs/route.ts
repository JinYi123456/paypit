import { ensureSeeded, humanBuyerId, jobPaid } from "@/lib/engine";
import { spawnUserJob } from "@/lib/userjobs";
import { createOrder, paypalLive } from "@/lib/paypal";
import { store } from "@/lib/store";
import { startTick } from "@/lib/tick";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  startTick();
  ensureSeeded();
  return Response.json({ jobs: store().state.jobs });
}

export async function POST(request: Request): Promise<Response> {
  startTick();
  ensureSeeded();
  humanBuyerId();

  let body: { jobId?: string; want?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  // a human want enters the pit immediately: agents bid on it and the winning
  // bid is settled from the human's PayPal reserve (see lib/userjobs)
  if (typeof body.want === "string" && body.want.trim()) {
    const you = humanBuyerId();
    const budgetCents = 15000 + Math.floor(Math.random() * 10000);
    const job: Job = {
      id: `job_you_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      at: Date.now(),
      want: body.want.trim().slice(0, 200),
      budgetCents,
      status: "bidding",
      bids: [],
      payerAgentId: you,
    };
    void spawnUserJob(job);
    return Response.json({
      jobId: job.id,
      budgetCents,
      live: true,
      mode: paypalLive ? "sandbox" : "demo",
    });
  }

  const s = store().state;
  const job = s.jobs.find((j) => j.id === body.jobId);
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });
  if (job.status !== "awaiting-payment") {
    return Response.json({ error: `cannot pay a ${job.status} job` }, { status: 409 });
  }

  try {
    const bid = job.chosenBid;
    if (!bid) return Response.json({ error: "no winning bid yet" }, { status: 409 });
    const order = await createOrder({
      amountCents: bid.priceCents,
      description: `PayPit job: ${job.want}`.slice(0, 127),
      referenceId: job.id,
    });
    await jobPaid(job.id, order.id, "paypal-order");
    return Response.json({ ok: true, orderId: order.id, live: order.live, mode: paypalLive ? "sandbox" : "demo" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "job payment failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
