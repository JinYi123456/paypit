"use client";

import { useEffect, useRef, useState } from "react";
import { fmtUS } from "@/lib/fmt";
import { loadPayPalSdk, paypalButtonsConfig } from "@/lib/pp";
import type { Job, WorldSnapshot } from "@/lib/types";

// ---------- world want ----------

export function WorldWant({ world }: { world: WorldSnapshot }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setPosted(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/pit+json" },
        body: JSON.stringify({ want: text.trim() }),
      });
      const j = (await res.json()) as { jobId?: string; error?: string };
      if (j.jobId) {
        setPosted("posted");
        setText("");
      } else {
        setPosted(j.error ?? "failed");
      }
    } catch {
      setPosted("failed");
    }
    setTimeout(() => setPosted(null), 2600);
    setBusy(false);
  };

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between">
        <span className="panel-title">Publish a Want</span>
        <span className={`badge ${world.llm === "live" ? "badge-blue" : ""}`}>
          {world.llm === "live" ? "agents bidding with live LLM" : "agents bidding (scripted)"}
        </span>
      </div>
      <div className="mt-2" style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="what do you need done? agents will bid to fulfill it…"
          style={{
            flex: 1,
            border: "1px solid #232a40",
            background: "#0a0e1a",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 12.5,
            color: "#e8ecf4",
            outline: "none",
          }}
        />
        <button className="btn-gold" disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? "…" : "auction"}
        </button>
      </div>
      {posted && <div style={{ marginTop: 4, fontSize: 10.5, color: "#34d399" }}>{posted}{posted === "posted" ? " — watch the bids come in" : ""}</div>
      }
    </div>
  );
}

// ---------- jobs rail ----------

export function JobsRail({ world, clientId }: { world: WorldSnapshot; clientId: string }) {
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
      <div className="px-4 pt-3">
        <span className="panel-title">Open Wants · agent-to-agent work</span>
      </div>
      <div className="px-3 pb-3" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
        {world.jobs.length === 0 && (
          <div style={{ fontSize: 11, color: "#4d5570", padding: "4px 2px" }}>the board is empty… wants land shortly.</div>
        )}
        {world.jobs.map((job) => (
          <JobCard key={job.id} job={job} world={world} clientId={clientId} />
        ))}
      </div>
    </div>
  );
}

function JobCard({ job, world, clientId }: { job: Job; world: WorldSnapshot; clientId: string }) {
  const payer = world.agents.find((a) => a.id === job.payerAgentId);
  const winner = job.chosenBid ? world.agents.find((a) => a.id === job.chosenBid!.agentId) : undefined;

  return (
    <div className="rounded-xl border border-[#161c2d] bg-[#0a0e1a] p-3">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e8ecf4", lineHeight: 1.35 }}>{job.want}</div>
          <div style={{ marginTop: 2, fontSize: 10.5, color: "#67708a" }}>
            {!payer
              ? "agent-published want"
              : payer.human
                ? `${payer.emoji} you need this done · sponsored from your PayPal reserve`
                : `${payer.emoji} ${payer.name} needs this done`}
          </div>
        </div>
        <span
          className={`badge ${job.status === "delivered" ? "badge-green" : job.status === "paid" ? "badge-blue" : ""}`}
          style={{ flex: "none" }}
        >
          {job.status === "awaiting-payment" ? "needs payment" : job.status.replace("-", " ")}
        </span>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className="badge">budget {fmtUS(job.budgetCents)}</span>
        <span className="badge">{job.bids.length}/3 bids</span>
      </div>

      {job.status === "bidding" && job.bids.length === 0 && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#67708a" }}>
          <span className="pip" style={{ width: 6, height: 6, borderRadius: 999, background: "#f5b02e", display: "inline-block" }} />
          agents are bidding…
        </div>
      )}

      {job.bids.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {[...job.bids]
            .sort((a, b) => a.priceCents - b.priceCents)
            .map((b) => {
              const ag = world.agents.find((a) => a.id === b.agentId);
              const isWin = job.chosenBid?.agentId === b.agentId;
              return (
                <div
                  key={b.agentId}
                  style={{
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 11,
                    background: isWin ? "#f5b02e0d" : "#0d1120",
                    border: isWin ? "1px solid #f5b02e55" : "1px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: isWin ? "#f5b02e" : "#cfd7e9" }}>
                      {ag?.emoji ?? "·"} {ag?.handle ?? "?"} — {fmtUS(b.priceCents)} · ETA {b.etaHours}h
                      {isWin ? " ★" : ""}
                    </span>
                    <span style={{ fontSize: 9, color: "#4d5570", flex: "none" }}>{b.engine === "llm" ? "LLM" : "auto"}</span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: "#8f97b0" }}>“{b.line}”</div>
                </div>
              );
            })}
        </div>
      )}

      {(job.status === "awaiting-payment" || job.status === "paid") && winner && (
        <div style={{ marginTop: 8, borderTop: "1px solid #141a2b", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, color: "#67708a" }}>
            <span>
              {winner.emoji} {winner.handle} wins at {job.chosenBid ? fmtUS(job.chosenBid.priceCents) : "—"}
            </span>
            <span>{payer ? `covered by ${payer.handle}` : ""}</span>
          </div>
          {job.status === "awaiting-payment" &&
            (payer?.human ? (
              <div style={{ marginTop: 6, fontSize: 10.5, color: "#7db4ff" }}>
                your PayPal reserve settles this the moment the auction closes…
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, color: "#4d5570", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  settle {payer?.name ?? "the agent"}'s win via PayPal
                </div>
                <JobPay jobId={job.id} clientId={clientId} />
              </div>
            ))}
          {job.status === "paid" && <div style={{ marginTop: 6, fontSize: 10.5, color: "#34d399" }}>payment captured · delivery in motion…</div>}
        </div>
      )}
      {job.status === "delivered" && (
        <div style={{ marginTop: 8, borderTop: "1px solid #141a2b", paddingTop: 8, fontSize: 11, color: "#8f97b0", display: "flex", gap: 6 }}>
          <span>✅</span>
          <span>{job.deliveryNote}</span>
        </div>
      )}
    </div>
  );
}

// ---------- PayPal pay button per awaiting job ----------

function JobPay({ jobId, clientId }: { jobId: string; clientId: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const slot = ref.current;
    if (!slot || slot.hasChildNodes() || done || !clientId) return;
    let alive = true;
    loadPayPalSdk(clientId)
      .then((sdk) => {
        if (!alive) return;
        const paypal = sdk as {
          Buttons: (cfg: {
            style?: Record<string, string>;
            createOrder: () => Promise<string>;
            onApprove: (d: { orderID: string }) => Promise<void>;
            onError: (e: unknown) => void;
          }) => { render: (el: HTMLElement) => Promise<void> };
        };
        return paypal
          .Buttons({
            style: { ...paypalButtonsConfig().style, label: "pay" },
            createOrder: async () => {
              const res = await fetch("/api/jobs", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jobId }),
              });
              const j = (await res.json()) as { orderId?: string; error?: string };
              if (!res.ok || !j.orderId) throw new Error(j.error ?? "order failed");
              return j.orderId;
            },
            onApprove: async (_d) => {
              setDone(true);
            },
            onError: (e) => {
              setErr(e instanceof Error ? e.message : "PayPal error");
            },
          })
          .render(slot)
          .catch((e) => {
            if (alive) setErr(e instanceof Error ? e.message : "render failed");
          });
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "SDK failed");
      });
    return () => {
      alive = false;
    };
  }, [jobId, clientId, done]);

  return (
    <div>
      {done ? (
        <div style={{ fontSize: 11, color: "#34d399" }}>paid — thank you for funding the floor</div>
      ) : (
        <div ref={ref} className="paypal-slot" />
      )}            {err && <div style={{ marginTop: 4, fontSize: 10.5, color: "#f87171" }}>{err}</div>}
    </div>
  );
}
