"use client";

import { useEffect, useRef, useState } from "react";
import { fmtUS } from "@/lib/fmt";
import type { Agent, LedgerEntry, WorldSnapshot } from "@/lib/types";

interface Props {
  world: WorldSnapshot;
  recentLedger: LedgerEntry[];
}

function stateColor(agent: Agent): string {
  switch (agent.state) {
    case "negotiating":
      return "#f5b02e";
    case "delivering":
      return "#7db4ff";
    case "paid":
      return "#34d399";
    default:
      return "#2a3248";
  }
}

export function Agents({ world, recentLedger }: Props) {
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const lastId = useRef<string>("");

  useEffect(() => {
    if (!recentLedger.length) return;
    if (recentLedger[0].id !== lastId.current) {
      lastId.current = recentLedger[0].id;
      setRecent([recentLedger[0]]);
    }
  }, [recentLedger]);

  return (
    <div className="panel relative flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="panel-title">The Floor · {world.agents.filter((a) => !a.human).length} agents</span>
        <span className="flex items-center gap-2 text-[10px] text-[#67708a]">
          <span className="pip inline-block h-2 w-2 rounded-full bg-[#34d399]" style={{ backgroundColor: "#34d399" }} />
          live
        </span>
      </div>
      <div
        className="grid gap-2 p-3 pt-1"
        style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
        data-testid="agent-floor"
      >
        {world.agents
          .filter((a) => !a.human)
          .map((agent) => {
            const flash = recent.some((r) => r.buyerId === agent.id) ? " moneypop" : "";
            return (
              <div
                key={agent.id}
                className="rounded-xl border border-[#161c2d] bg-[#0a0e1a] p-3 transition-colors hover:border-[#232a40]"
                style={{ boxShadow: `inset 3px 0 0 hsl(${agent.hue} 70% 55%)` }}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="flex-none"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 16,
                      background: `hsl(${agent.hue} 60% 18%)`,
                      border: `1px solid hsl(${agent.hue} 60% 35%)`,
                      position: "relative",
                    }}
                  >
                    {agent.emoji}
                    <span
                      style={{
                        position: "absolute",
                        right: -2,
                        bottom: -2,
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: stateColor(agent),
                        boxShadow: `0 0 8px ${stateColor(agent)}`,
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: "#e8ecf4", fontSize: 13, fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ color: "#67708a", fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {agent.mood}
                    </div>
                  </div>
                </div>
                <div className="mt-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                  <div style={{ textAlign: "center" }}>
                    <div className={flash} style={{ color: "#e8ecf4", fontSize: 12, fontWeight: 700 }}>{fmtUS(agent.walletCents)}</div>
                    <div style={{ color: "#4d5570", fontSize: 8.5, letterSpacing: "0.15em", textTransform: "uppercase" }}>wallet</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#e8ecf4", fontSize: 12, fontWeight: 700 }}>{agent.deals}</div>
                    <div style={{ color: "#4d5570", fontSize: 8.5, letterSpacing: "0.15em", textTransform: "uppercase" }}>deals</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#f5b02e", fontSize: 12, fontWeight: 700 }}>{agent.reputation.toFixed(1)}</div>
                    <div style={{ color: "#4d5570", fontSize: 8.5, letterSpacing: "0.15em", textTransform: "uppercase" }}>rep</div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
