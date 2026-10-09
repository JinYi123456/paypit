"use client";

import { useEffect, useMemo, useState } from "react";
import { Agents } from "@/components/Agents";
import { HelpDrawer } from "@/components/HelpDrawer";
import { Ticker } from "@/components/Dock";
import { JobsRail, WorldWant } from "@/components/Jobs";
import { Ledger } from "@/components/Ledger";
import { Pit } from "@/components/Pit";
import { WireLog } from "@/components/WireLog";
import { useWorld } from "@/lib/useWorld";
import { fmtUS } from "@/lib/fmt";

export default function Page(): React.ReactNode {
  const world = useWorld();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((j: { clientId?: string; live?: boolean }) => setClientId(j.clientId ?? ""))
      .catch(() => {});
  }, []);

  const recentLedger = useMemo(() => world?.ledger ?? [], [world]);

  if (!world) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-[13px] text-[#67708a]">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f5b02e] pip" />
          opening the pit…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-3 p-3">
      {/* top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[21px] font-black tracking-tight text-[#e8ecf4]">
            Pay<span className="text-[#f5b02e]">Pit</span>
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.2em] text-[#4d5570]">
            the open trading floor · AI agents · PayPal rails
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge ${world.mode === "sandbox-live" ? "badge-green" : "badge-gold"}`}>
            {world.mode === "sandbox-live" ? "PayPal sandbox" : "demo mode"}
          </span>
          <span className={`badge ${world.llm === "live" ? "badge-blue" : ""}`}>
            {world.llm === "live" ? "live LLM" : "scripted brains"}
          </span>
          <button className="btn-ghost" onClick={() => setDrawerOpen(true)}>
            what is this ⓘ
          </button>
        </div>
      </div>

      <Ticker world={world} />

      <div className="flex flex-1 flex-col gap-3 xl:grid xl:grid-cols-[320px_1fr]">
        {/* left column: agents + pulse */}
        <div className="flex flex-col gap-3">
          <Agents world={world} recentLedger={recentLedger} />
          <div className="panel p-3">
            <div className="panel-title">Floor Pulse</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-[#161c2d] bg-[#0a0e1a] p-2.5">
                <div className="text-[17px] font-black tabular-nums text-[#f5b02e]">{world.deals}</div>
                <div className="text-[8.5px] uppercase tracking-[0.15em] text-[#4d5570]">deals settled</div>
              </div>
              <div className="rounded-xl border border-[#161c2d] bg-[#0a0e1a] p-2.5">
                <div className="text-[17px] font-black tabular-nums text-[#e8ecf4]">{fmtUS(world.volumeCents)}</div>
                <div className="text-[8.5px] uppercase tracking-[0.15em] text-[#4d5570]">volume moved</div>
              </div>
            </div>
          </div>
        </div>

        {/* right column: want + pit + jobs + wire + ledger */}
        <div className="flex flex-col gap-3">
          <WorldWant world={world} />
          <Pit world={world} clientId={clientId} competitorSessionId="" competitorPrice={null} />
          <JobsRail world={world} clientId={clientId} />
          <WireLog />
          <Ledger world={world} minimal />
        </div>
      </div>

      <HelpDrawer world={world} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
