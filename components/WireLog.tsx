"use client";

import { useMemo, useState } from "react";
import { fmtUS } from "@/lib/fmt";

/*
  Compact API-runner illustrating a sampling of PayPal + PayPit calls. The
  full playable surface is the dashboard further down this page.
*/

const SAMPLES: Array<{ method: string; path: string; label: string; body: string }> = [
  {
    method: "POST",
    path: "/v2/checkout/orders",
    label: "PayPal · create order (sandbox)",
    body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { value: "39.00" } }] }, null, 2),
  },
  {
    method: "POST",
    path: "/v1/payments/payouts",
    label: "PayPal · payout (sandbox)",
    body: JSON.stringify({ items: [{ receiver: "sandbox-merchant@paypit.dev", amount: { value: "25.00" } }] }, null, 2),
  },
  {
    method: "GET",
    path: "/api/roster",
    label: "PayPit · world snapshot",
    body: "",
  },
  {
    method: "POST",
    path: "/api/jobs",
    label: "PayPit · publish want",
    body: JSON.stringify({ want: "Commission a quick audio drama, 2 episodes." }, null, 2),
  },
];

export function WireLog(): React.ReactNode {
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const sample = SAMPLES[sel];

  const endpoints = useMemo(
    () => ["/api/config", "/api/roster", "/api/events", "/api/jobs", "/api/checkout", "/api/cashout"],
    [],
  );

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (sample.path.startsWith("/api/")) {
        const res = await fetch(sample.path, { method: sample.method });
        const text = await res.text();
        setResult(`${sample.method} ${sample.path} → ${res.status}\n${text.slice(0, 400)}`);
      } else {
        setResult(`${sample.method} ${sample.path} — needs sandbox credentials (or press the buttons above).`);
      }
    } catch (e) {
      setResult(`error: ${e instanceof Error ? e.message : "failed"}`);
    }
    setBusy(false);
  };

  return (
    <div className="panel" style={{ padding: 12, minHeight: 220 }}>
      <div className="flex" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <span className="panel-title">Settlement Wire · live API runner</span>
        <span style={{ fontSize: 10, color: "#4d5570" }}>{endpoints.length} endpoints live</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {SAMPLES.map((s, i) => (
          <button
            key={i}
            onClick={() => setSel(i)}
            style={{
              fontSize: 10.5,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1px solid ${i === sel ? "#f5b02e88" : "#232a40"}`,
              color: i === sel ? "#f5b02e" : "#b8c1d8",
              background: i === sel ? "#f5b02e0d" : "transparent",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre
        style={{
          marginTop: 8,
          fontSize: 11,
          lineHeight: 1.5,
          color: "#8f97b0",
          background: "#060910",
          border: "1px solid #141a2b",
          borderRadius: 10,
          padding: 10,
          maxHeight: 130,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {sample.body || "—"}
      </pre>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <button className="btn-gold" disabled={busy} onClick={() => void run()}>
          {busy ? "firing…" : "run call"}
        </button>
        {result && <span style={{ fontSize: 10, color: "#34d399" }}>{result.split("\n")[0]}</span>}
      </div>
      {result && (
        <pre
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "#67708a",
            maxHeight: 90,
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
