import { cashOut } from "@/lib/engine";
import { paypalLive } from "@/lib/paypal";
import { startTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  startTick();
  let body: { agentId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const s = (await import("@/lib/store")).store().state;
  const target =
    (body.agentId && s.agents.find((a) => a.id === body.agentId)) ||
    [...s.agents].sort((a, b) => b.walletCents - a.walletCents)[0];

  if (!target) return Response.json({ error: "no agents" }, { status: 404 });

  const res = await cashOut(target.id);
  if (!res.ok) return Response.json({ error: res.error }, { status: 409 });
  return Response.json({ ok: true, agent: target.handle, mode: paypalLive ? "sandbox" : "demo" });
}
