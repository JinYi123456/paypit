// PayPal REST adapter. Uses real sandbox (or live) credentials when provided;
// otherwise runs in demo mode where every call is simulated but still audited
// in the Wire Log, so the whole flow is observable either way.

import type { WireCall } from "./types";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export const paypalLive = Boolean(CLIENT_ID && CLIENT_SECRET);

type WireSink = (call: Omit<WireCall, "id" | "at">) => void;
let wireSink: WireSink = () => {};
export function setWireSink(fn: WireSink) {
  wireSink = fn;
}

function randId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

// ---- token cache (live mode) ----
let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const t0 = Date.now();
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  wireSink({
    method: "POST",
    path: "/v1/oauth2/token",
    label: "OAuth2 client-credentials token",
    status: res.status,
    ms: Date.now() - t0,
    live: true,
  });
  if (!res.ok || !data.access_token) throw new Error(`paypal oauth failed (${res.status})`);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 };
  return token.value;
}

async function call<T>(
  method: string,
  path: string,
  label: string,
  body?: unknown,
): Promise<{ status: number; data: T | null }> {
  const t0 = Date.now();
  try {
    const auth = await accessToken();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${auth}`,
        "content-type": "application/json",
        ...(body ? { "PayPal-Request-Id": randId("REQ") } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
    wireSink({
      method,
      path,
      label,
      status: res.status,
      ms: Date.now() - t0,
      live: true,
    });
    return { status: res.status, data };
  } catch (err) {
    wireSink({
      method,
      path,
      label: `${label} (error)`,
      status: 0,
      ms: Date.now() - t0,
      live: true,
    });
    return { status: 0, data: null };
  }
}

function demo<T>(method: string, path: string, label: string, data: T, ms = 90): { status: number; data: T } {
  wireSink({ method, path, label, status: "DEMO", ms, live: false });
  return { status: 201, data };
}

// ---- Orders v2 ----

export interface OrderResult {
  id: string;
  live: boolean;
}

export async function createOrder(args: {
  amountCents: number;
  description: string;
  referenceId: string;
}): Promise<OrderResult> {
  const usd = (args.amountCents / 100).toFixed(2);
  if (!paypalLive) {
    return demo("POST", "/v2/checkout/orders", `Create order $${usd} — ${args.description}`, {
      id: randId("DEMO"),
      live: false,
    }).data;
  }
  const { data } = await call<{ id?: string }>(
    "POST",
    "/v2/checkout/orders",
    `Create order $${usd} — ${args.description}`,
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.referenceId,
          description: args.description.slice(0, 127),
          amount: { currency_code: "USD", value: usd },
        },
      ],
    },
  );
  if (!data?.id) throw new Error("paypal createOrder failed");
  return { id: data.id, live: true };
}

export async function captureOrder(orderId: string): Promise<{ ok: boolean; live: boolean }> {
  if (!paypalLive || orderId.startsWith("DEMO-")) {
    return demo("POST", `/v2/checkout/orders/${orderId}/capture`, `Capture order ${orderId}`, {
      ok: true,
      live: false,
    }).data;
  }
  const { status, data } = await call<{ status?: string }>(
    "POST",
    `/v2/checkout/orders/${orderId}/capture`,
    `Capture order ${orderId}`,
  );
  const ok = status === 201 && data?.status === "COMPLETED";
  return { ok, live: true };
}

// ---- Payouts v1 ----

export async function payout(args: {
  receiverEmail: string;
  amountCents: number;
  note: string;
}): Promise<{ batchId: string; live: boolean; ok: boolean }> {
  const usd = (args.amountCents / 100).toFixed(2);
  if (!paypalLive) {
    return demo(
      "POST",
      "/v1/payments/payouts",
      `Payout $${usd} → ${args.receiverEmail}`,
      { batchId: randId("DEMO"), live: false, ok: true },
    ).data;
  }
  const { status, data } = await call<{ batch_header?: { payout_batch_id?: string } }>(
    "POST",
    "/v1/payments/payouts",
    `Payout $${usd} → ${args.receiverEmail}`,
    {
      sender_batch_header: {
        sender_batch_id: randId("BATCH"),
        email_subject: "PayPit payout",
        email_message: args.note.slice(0, 200),
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: usd, currency: "USD" },
          receiver: args.receiverEmail,
          note: args.note.slice(0, 200),
        },
      ],
    },
  );
  const batchId = data?.batch_header?.payout_batch_id ?? randId("BATCH");
  return { batchId, live: true, ok: status === 201 };
}

export function clientIdPublic(): string {
  return CLIENT_ID;
}
