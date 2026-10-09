import { paypalLive } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const clientId = process.env.PAYPAL_CLIENT_ID || "";
  const demo = !clientId && !process.env.PAYPAL_CLIENT_SECRET;
  return Response.json({
    clientId,
    live: paypalLive,
    mode: paypalLive ? "sandbox" : demo ? "demo" : "unknown",
    tools: ["AG Grid", "PayPal Orders v2", "PayPal Payouts", "@paypal/paypal-js"],
  });
}
