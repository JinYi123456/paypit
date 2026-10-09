import { ensureSeeded, humanBuyerId, ledgerForHumanPurchase } from "@/lib/engine";
import { captureOrder, createOrder, paypalLive } from "@/lib/paypal";
import { snapshot, store } from "@/lib/store";
import { startTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  startTick();
  ensureSeeded();
  humanBuyerId();

  let body: {
    op?: string;
    listingId?: string;
    priceCents?: number;
    orderId?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  const s = store().state;

  try {
    if (body.op === "create") {
      if (!body.listingId) return Response.json({ error: "listingId required" }, { status: 400 });
      const listing = s.listings.find((l) => l.id === body.listingId);
      if (!listing) return Response.json({ error: "unknown listing" }, { status: 404 });
      const priceCents = body.priceCents ?? listing.priceCents;
      const order = await createOrder({
        amountCents: priceCents,
        description: `PayPit: ${listing.title}`.slice(0, 127),
        referenceId: listing.id,
      });
      return Response.json({
        orderId: order.id,
        live: order.live,
        paypalLive,
        mode: paypalLive ? "sandbox" : "demo",
      });
    }

    if (body.op === "capture") {
      const orderId = body.orderId;
      if (!orderId || !body.listingId) {
        return Response.json({ error: "orderId + listingId required" }, { status: 400 });
      }
      const listing = s.listings.find((l) => l.id === body.listingId);
      if (!listing) return Response.json({ error: "unknown listing" }, { status: 404 });
      const priceCents = body.priceCents ?? listing.priceCents;

      const cap = await captureOrder(orderId);
      if (!cap.ok && cap.live) {
        return Response.json({ error: "capture failed" }, { status: 502 });
      }
      ledgerForHumanPurchase({ listingId: body.listingId, name: "You", priceCents, orderId });
      return Response.json({ ok: true, captured: cap.live ? "paypal" : "demo", snapshot: snapshot() });
    }

    return Response.json({ error: "unknown op" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "checkout failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
