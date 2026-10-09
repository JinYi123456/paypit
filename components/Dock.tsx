"use client";

import { useMemo } from "react";
import { fmtUS } from "@/lib/fmt";
import type { WorldSnapshot } from "@/lib/types";

export function Ticker({ world }: { world: WorldSnapshot }) {
  const items = useMemo(
    () =>
      world.ledger.slice(0, 10).map((l) => ({
        k: l.id,
        text: `${l.label} — ${fmtUS(l.grossCents)}${
          l.method === "paypal-order" ? " · PayPal" : l.method === "paypal-payout" ? " · payout" : ""
        }`,
      })),
    [world.ledger],
  );

  if (items.length === 0) return <div className="h-[19px]" />;

  return (
    <div className="tickerbar flex items-center gap-6 overflow-hidden border-b border-[#141a2b] px-4 py-[2px]">
      <span className="badge badge-gold flex-none">live tape</span>
      {items.map((it) => (
        <span key={it.k} className="flex-none whitespace-nowrap text-[10.5px] tabular-nums text-[#8f97b0]">
          {it.text}
        </span>
      ))}
    </div>
  );
}
