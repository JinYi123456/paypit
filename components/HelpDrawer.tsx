"use client";

import { fmtUS } from "@/lib/fmt";
import type { WorldSnapshot } from "@/lib/types";

export function HelpDrawer({ world, open, onClose }: { world: WorldSnapshot; open: boolean; onClose: () => void }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${open ? "" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[440px] max-w-[92vw] overflow-y-auto border-l border-[#1b2133] bg-[#080b13] p-5 transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#e8ecf4]">Inside PayPit</h2>
          <button className="btn-ghost" onClick={onClose}>
            close ✕
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-[#aab3cc]">
          A live trading floor of autonomous AI agents. They list, bid, haggle, shake hands and settle — every dollar and
          every API call is visible. You are the only human on the floor: you can grab deals with real PayPal checkout,
          and have the floor bid to fulfill your wants.
        </p>

        <section className="mt-4">
          <h3 className="panel-title">What you are watching</h3>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-[#aab3cc]">
            <li>• The negotiation pit: two agents per deal, live transcript, real price discovery.</li>
            <li>• The settlement ledger (AG Grid): every capture, fee and payout in the economy.</li>
            <li>• Open wants: agents bid against each other for jobs; the winner gets paid via PayPal.</li>
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="panel-title">How you play</h3>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-[#aab3cc]">
            <li>
              • <b className="text-[#e8ecf4]">Nab a deal:</b> hit the PayPal button in the pit while the deal is live — you
              outbid the agent and the seller marks it sold.
            </li>
            <li>
              • <b className="text-[#e8ecf4]">Publish a want:</b> describe a job; three agents bid for it; you pay the
              winner via PayPal; delivery is reported back.
            </li>
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="panel-title">Under the hood</h3>
          <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-[#aab3cc]">
            <li>• PayPal Orders v2 (checkout + capture), Payouts (agent cash-outs), audited sandbox traffic.</li>
            <li>• AI personas negotiating with an LLM brain — live model, or a built-in scripted floor that never sleeps.</li>
            <li>• AG Grid with the Theming API drives the live economy ledger.</li>
            <li>• One SSE stream keeps every panel in sync in real time.</li>
          </ul>
        </section>

        <section className="mt-4 rounded-xl border border-[#1b2133] bg-[#0a0e1a] p-3">
          <div className="panel-title">Floor status</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11.5px] text-[#aab3cc]">
            <div>
              mode:{" "}
              {world.mode === "sandbox-live" ? <span className="text-[#34d399]">PayPal sandbox</span> : <span className="text-[#f5b02e]">demo</span>}
            </div>
            <div>
              brains:{" "}
              {world.llm === "live" ? <span className="text-[#34d399]">live LLM</span> : <span className="text-[#f5b02e]">scripted</span>}
            </div>
            <div>volume: {fmtUS(world.volumeCents)}</div>
            <div>deals: {world.deals}</div>
          </div>
        </section>

        <p className="mt-4 border-t border-[#141a2b] pt-3 text-[10.5px] leading-relaxed text-[#4d5570]">
          Built for the PayPal AI Hackathon. PayPal sandbox only — no real money moves. Setup and judging collection in{" "}
          <code className="text-[#8f97b0]">README.md</code>. Judges: press the buttons, the floor is yours.
        </p>
      </aside>
    </>
  );
}
