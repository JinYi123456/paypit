"use client";

import { useCallback, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { themeQuartz, ModuleRegistry, AllCommunityModule } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);
import type { CellClassParams, ColDef } from "ag-grid-community";
import { fmtUS } from "@/lib/fmt";
import type { LedgerEntry, WorldSnapshot } from "@/lib/types";

interface Props {
  world: WorldSnapshot;
  minimal?: boolean;
}

const darkTheme = themeQuartz.withParams({
  accentColor: "#f5b02e",
  backgroundColor: "#0a0e18",
  foregroundColor: "#cfd7e9",
  borderColor: "#1b2133",
  headerBackgroundColor: "#0a0e19",
  headerTextColor: "#7e88a4",
  oddRowBackgroundColor: "#090c15",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 12.5,
  headerFontSize: 10.5,
  headerFontWeight: 700,
  headerHeight: 34,
  rowHeight: 34,
  wrapperBorderRadius: 12,
  spacing: 8,
});

function statusColor(status: LedgerEntry["status"]): string {
  switch (status) {
    case "captured":
    case "demo":
      return "#34d399";
    case "pending":
      return "#7db4ff";
    case "failed":
      return "#f87171";
    default:
      return "#9099b2";
  }
}

export function Ledger({ world, minimal }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const columnDefs = useMemo<ColDef<LedgerEntry>[]>(
    () => [
      {
        headerName: "Settlement",
        field: "label",
        flex: 2.1,
        minWidth: 200,
        valueGetter: (p) => p.data?.label ?? "",
        tooltipField: "label",
      },
      {
        headerName: "Amount",
        field: "grossCents",
        flex: 0.8,
        cellClass: () => "tabular-nums font-semibold",
        valueFormatter: (p) => (typeof p.value === "number" ? fmtUS(p.value) : ""),
      },
      {
        headerName: "Fee",
        field: "feeCents",
        flex: 0.55,
        cellClass: "text-[#67708a]",
        valueFormatter: (p) => (typeof p.value === "number" ? fmtUS(p.value) : "—"),
      },
      {
        headerName: "Rail",
        field: "method",
        flex: 0.9,
        valueFormatter: (p) => {
          switch (p.value as string) {
            case "paypal-order":
              return "PayPal Orders v2";
            case "paypal-payout":
              return "PayPal Payouts";
            default:
              return "PayPit Wallet";
          }
        },
      },
      { headerName: "Ref", field: "ref", flex: 0.9, cellClass: "text-[#67708a]", tooltipField: "ref" },
      {
        headerName: "Status",
        field: "status",
        flex: 0.7,
        cellClass: (params: CellClassParams) => "font-semibold",
        cellStyle: (p) => ({ color: statusColor((p.data as LedgerEntry).status) }),
        valueGetter: (p) => (p.data?.status ?? "").toUpperCase(),
      },
      {
        headerName: "Time",
        field: "at",
        flex: 0.8,
        cellClass: "text-[#67708a]",
        valueFormatter: (p) => (p.data ? new Date(p.data.at).toLocaleTimeString() : ""),
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, resizable: true }), []);

  const cashOut = useCallback(async () => {
    if (busy) return;
    const rich = [...world.agents].sort((a, b) => b.walletCents - a.walletCents)[0];
    if (!rich || rich.walletCents < 500) {
      setNote("no agent has held $5 yet");
      setTimeout(() => setNote(null), 2500);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cashout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: rich.id }),
      });
      const j = (await res.json()) as { ok?: boolean; mode?: string; error?: string };
      setNote(j.ok ? `payout sent for ${rich.handle} (${j.mode})` : j.error ?? "payout failed");
    } catch {
      setNote("payout request failed");
    } finally {
      setBusy(false);
      setTimeout(() => setNote(null), 3500);
    }
  }, [world.agents, busy]);

  return (
    <div className="panel flex h-full min-h-[200px] flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="panel-title">Settlement Ledger · AG Grid</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] tabular-nums text-[#67708a]">
            volume {fmtUS(world.volumeCents)} · fees {fmtUS(world.feeCents)} · {world.ledger.length} rows
          </span>
          <button className="btn-ghost" disabled={busy} onClick={cashOut} title="The richest agent cashes out via PayPal Payouts">
            {busy ? "wiring…" : "top agent · cash out 💸"}
          </button>
        </div>
      </div>
      {note && <div className="px-4 pt-1 text-[11px] text-[#7db4ff]">{note}</div>}
      <div className="mt-2 flex-1 px-3 pb-3" style={{ minHeight: minimal ? 150 : 260 }} data-testid="ledger-grid">
        <AgGridReact
          theme={darkTheme}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowData={world.ledger}
          getRowId={(p) => String(p.data.id)}
          headerHeight={34}
          rowHeight={34}
          suppressCellFocus
          animateRows
          pagination={minimal}
          paginationPageSize={8}
          paginationPageSizeSelector={false}
        />
      </div>
    </div>
  );
}
