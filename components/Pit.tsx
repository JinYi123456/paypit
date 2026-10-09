"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtUS } from "@/lib/fmt";
import { loadPayPalSdk, paypalButtonsConfig } from "@/lib/pp";
import type { Listing, Thread, WorldSnapshot } from "@/lib/types";

interface Props {
  world: WorldSnapshot;
  clientId: string;
  competitorSessionId: string;
  competitorPrice: number | null;
}

interface Purchase {
  title: string;
  amount: number;
  ord: string;
  at: number;
}

const ORD_KEY = "paypit_purchases";

function ordLoad(): Purchase[] {
  try {
    const raw = localStorage.getItem(ORD_KEY);
    return raw ? (JSON.parse(raw) as Purchase[]) : [];
  } catch {
    return [];
  }
}

function ordSave(p: Purchase): void {
  const all = [p, ...ordLoad()].slice(0, 12);
  try {
    localStorage.setItem(ORD_KEY, JSON.stringify(all));
  } catch {
    // storage full / disabled — history is best-effort
  }
}

export function Pit({ world, clientId, competitorSessionId, competitorPrice }: Props) {
  const [done, setDone] = useState<Purchase[]>(ordLoad);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [lineIdx, setLineIdx] = useState(-1);
  const [slotted, setSlotted] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const listing: Listing | undefined = useMemo(() => {
    const open = world.threads.filter((t) => t.status === "open");
    if (open.length === 0) return undefined;
    const th = open[0];
    return world.listings.find((l) => l.id === th.listingId);
  }, [world]);

  const thread: Thread | undefined = useMemo(() => {
    const open = world.threads.filter((t) => t.status === "open");
    return open.length === 0 ? undefined : open[0];
  }, [world]);

  const seller = useMemo(
    () => (thread ? world.agents.find((a) => a.id === thread.sellerId) : undefined),
    [world, thread],
  );
  const buyer = useMemo(
    () => (thread ? world.agents.find((a) => a.id === thread.buyerId) : undefined),
    [world, thread],
  );

  const feedRef = useRef<HTMLDivElement | null>(null);
  const numpadRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, thread?.id]);

  useEffect(() => {
    if (!amount) setLineIdx(-1);
  }, [amount]);

  // PayPal buttons render (skipped in demo mode — no client id configured)
  useEffect(() => {
    if (!listing || slotted || !clientId) return;
    const slot = slotRef.current;
    if (!slot || slot.hasChildNodes()) return;
    setPlacing(true);
    loadPayPalSdk(clientId)
      .then((sdk) => {
        const paypal = sdk as {
          Buttons: (cfg: {
            style?: Record<string, string>;
            createOrder: (d: unknown, a: unknown) => Promise<string>;
            onApprove: (d: { orderID: string }) => Promise<void>;
            onError: (e: unknown) => void;
          }) => { render: (el: HTMLElement) => Promise<void> };
        };
        return paypal
          .Buttons({
            style: paypalButtonsConfig().style,
            createOrder: async () => {
              setErr(null);
              const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ op: "create", listingId: listing.id, priceCents: listing.priceCents }),
              });
              const j = (await res.json()) as { orderId?: string; error?: string };
              if (!res.ok || !j.orderId) throw new Error(j.error ?? "order failed");
              return j.orderId;
            },
            onError: (e) => {
              setErr(e instanceof Error ? e.message : "PayPal error");
              setPlacing(false);
            },
            onApprove: async (d) => {
              const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ op: "capture", listingId: listing.id, orderId: d.orderID, priceCents: listing.priceCents }),
              });
              const j = (await res.json()) as { ok?: boolean; error?: string };
              if (!res.ok || !j.ok) throw new Error(j.error ?? "capture failed");
              ordSave({ title: `Human acquisition: ${listing.title}`, amount: listing.priceCents, ord: d.orderID, at: Date.now() });
              setDone(ordLoad());
              setPlacing(false);
            },
          })
          .render(slot)
          .then(() => {
            setSlotted(true);
            setPlacing(false);
          });
      })
      .catch((e) => {
        setErr(e instanceof Error ? e.message : "PayPal SDK failed to load");
        setPlacing(false);
      });
  }, [listing, clientId, slotted]);

  const price = listing?.priceCents ?? 0;
  const knowsDelta = competitorPrice !== null ? competitorPrice - price : null;
  const yScroll = focusMode ? 380 : 170;

  return (
    <div className="panel relative flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="panel-title">Negotiation Pit</span>
          <span className="badge badge-gold">round {thread ? Math.floor(thread.messages.length / 2) + 1 : 0}</span>
        </div>
        <button
          className="text-[10px] uppercase tracking-[0.14em] text-[#67708a] transition-colors hover:text-[#e8ecf4]"
          onClick={() => setFocusMode((f) => !f)}
        >
          {focusMode ? "shrink" : "focus"}
        </button>
      </div>

      {/* offer strip */}
      <div className="relative px-4 py-3">
        {listing && seller ? (
          <>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[19px] font-black tracking-tight text-[#e8ecf4]">“{listing.title}”</div>
                <div className="truncate text-[11.5px] text-[#67708a]">{listing.blurb}</div>
              </div>
              <div className="flex-none text-right">
                <div className="text-[27px] font-black leading-none tracking-tight text-[#f5b02e] tabular-nums">
                  {fmtUS(price)}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[#4d5570]">ask · fresh quote</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10.5px] text-[#67708a]">
              <span className="flex items-center gap-1">
                <span>{seller.emoji}</span>
                {seller.name} · “{seller.tagline}”
              </span>
              <span className="flex items-center gap-1">
                <span>🤝</span> {buyer?.name ?? "—"} bidding
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-[72px] items-center justify-center text-[12px] text-[#67708a]">
            the floor is clearing — next match forms in a beat…
          </div>
        )}
      </div>

      <div className="h-px bg-[#141a2b]" />

      {/* transcript */}
      <div
        ref={feedRef}
        className="overflow-y-auto px-4 py-2"
        style={{ height: yScroll }}
        data-testid="pit-feed"
      >
        {thread?.messages.map((m, i) => {
          const agent = world.agents.find((a) => a.id === m.agentId);
          const isLast = i === thread.messages.length - 1;
          return (
            <div key={m.id} className={`chatline flex gap-2 py-[5px]${isLast ? " border-b border-[#141a2b] pb-2" : ""}`}>
              <div className="w-10 flex-none pt-0.5">
                {m.action === "accept" ? (
                  <span className="badge badge-green"> dealt</span>
                ) : m.action === "counter" ? (
                  <span className="text-[9px] uppercase tracking-wider text-[#f5b02e]">counter</span>
                ) : m.action === "offer" ? (
                  <span className="text-[9px] uppercase tracking-wider text-[#7db4ff]">offer</span>
                ) : (
                  <span className="text-[9px] uppercase tracking-wider text-[#67708a]">{m.action}</span>
                )}
              </div>
              <div className="min-w-0">
                <span style={{ color: `hsl(${agent?.hue ?? 200} 80% 70%)` }}>
                  {agent?.emoji} {agent?.handle}:
                </span>{" "}
                <span className="text-[12.5px] text-[#cfd7e9]">{m.line}</span>
              </div>
              <span className="ml-auto flex-none self-center text-[9px]" title={m.engine}>
                {m.engine === "llm" ? "🧠" : "⚙️"}
              </span>
            </div>
          );
        })}
        {!thread && (
          <div className="grid h-full place-items-center text-[11px] text-[#4d5570]">no open negotiations right now</div>
        )}
      </div>

      <div className="h-px bg-[#141a2b]" />

      {/* private band + numpad */}
      <div className="flex items-stretch justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="panel-title">Headset · crowded-floor chatter, private to you</div>
          <div className="mt-1 flex gap-1">
            {knowsDelta === null ? (
              <span className="text-[11px] text-[#67708a]">type your offer to hear what the floor thinks…</span>
            ) : knowsDelta === 0 ? (
              <span className="text-[11px] text-[#7db4ff]">overheard: “{price / 100} matches the current quote — clean”</span>
            ) : knowsDelta > 0 ? (
              <span className="text-[11px] text-[#f87171]">
                overheard: “paying {fmtUS(knowsDelta)} overask? bold. the pit remembers.”
              </span>
            ) : (
              <span className="text-[11px] text-[#34d399]">
                overheard: “{fmtUS(-knowsDelta)} under ask — {seller?.handle} hates this”
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setAmount(String(Math.max(0, Math.floor((listing?.priceCents ?? 0) * 0.9) - 1)).replace(/^0+/, ""))}>
              ⌨️ 10 under
            </button>
            <button
              className="text-[10px] uppercase tracking-[0.14em] text-[#67708a] hover:text-[#e8ecf4]"
              onClick={() => numpadRef.current?.focus()}
            >
              keyboard histories ↺
            </button>
            {knowsDelta === 0 && (
              <span className="badge badge-gold">10-under = instant-win convention</span>
            )}
          </div>
          <div
            ref={numpadRef}
            tabIndex={-1}
            className="mt-2 max-h-[70px] overflow-y-auto rounded-lg border border-[#141a2b] bg-[#080b13] p-2 text-[10.5px] text-[#67708a]"
          >
            {ordLoad().length === 0 ? "your PayPal offers + numpad history land here…" : ordLoad().slice(0, 3).map((p, i) => (
              <div key={i} className="flex justify-between gap-2 py-0.5">
                <span className="truncate">
                  <span className="text-[#f5b02e]">→ {fmtUS(p.amount)}</span> · {p.title.replace("Human acquisition: ", "")}
                </span>
                <span className="flex-none">{new Date(p.at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* numpad */}
        <div className="w-[152px] flex-none">
          <div className="grid grid-cols-3 gap-1">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
              <button key={k} className="numpad-key" onClick={() => setAmount(amount + k)}>
                {k}
              </button>
            ))}
            <button className="numpad-key" onClick={() => setAmount(amount.slice(0, -1))}>
              ⌫
            </button>
            <button className="numpad-key" onClick={() => setAmount("0" + amount)}>
              0
            </button>
            <button className="numpad-key" onClick={() => setAmount("")}>
              C
            </button>
          </div>
          <div className="mt-1 rounded-lg border border-[#232a40] bg-[#0a0e1a] px-2 py-1.5 text-center text-[14px] font-bold tabular-nums text-[#f5b02e]">
            {amount ? `$${amount}` : "$0"}
          </div>
        </div>
      </div>

      <div className="h-px bg-[#141a2b]" />

      {/* checkout bar */}
      <div className="px-4 py-3">
        {listing ? (
          <>
            <div ref={slotRef} className="paypal-slot" />
            {!clientId && (
              <div className="mt-1 text-[10.5px] leading-relaxed text-[#67708a]">
                demo mode — PayPal buttons activate the moment sandbox credentials are set. Judges can still watch every
                rail fire live in the wire log.
              </div>
            )}
            {placing && <div className="mt-1 text-[10.5px] text-[#67708a]">loading PayPal buttons…</div>}
            {err && <div className="mt-1 text-[11px] text-[#f87171]">{err}</div>}
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#67708a]">
              <span>you pay · pit remembers · seller agent marks sold</span>
              <span>
                {world.mode === "demo" ? "demo mode (add PAYPAL_CLIENT_ID for real sandbox)" : "PayPal sandbox live"}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center text-[11px] text-[#4d5570]">
            checkout arms when the next deal opens
          </div>
        )}
      </div>
    </div>
  );
}
