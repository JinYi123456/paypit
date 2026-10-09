// In-memory world store with JSON persistence and a tiny event bus for SSE.

import fs from "node:fs";
import path from "node:path";
import type {
  Agent,
  Job,
  LedgerEntry,
  Listing,
  Thread,
  WireCall,
  WorldSnapshot,
} from "./types";

export interface WorldState {
  agents: Agent[];
  listings: Listing[];
  threads: Thread[];
  ledger: LedgerEntry[];
  wire: WireCall[];
  jobs: Job[];
  volumeCents: number;
  feeCents: number;
  deals: number;
  startedAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "world.json");

const CAPS = { threads: 24, ledger: 80, wire: 60, jobs: 12, threadMsgs: 14 };

export type Listener = (snapshot: WorldSnapshot) => void;

interface Store {
  state: WorldState;
  listeners: Set<Listener>;
  flushTimer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __paypitStore?: Store };

function freshState(): WorldState {
  return {
    agents: [],
    listings: [],
    threads: [],
    ledger: [],
    wire: [],
    jobs: [],
    volumeCents: 0,
    feeCents: 0,
    deals: 0,
    startedAt: Date.now(),
  };
}

function loadFromDisk(): WorldState {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as WorldState;
    return { ...freshState(), ...parsed };
  } catch {
    return freshState();
  }
}

export function store(): Store {
  if (!g.__paypitStore) {
    g.__paypitStore = {
      state: loadFromDisk(),
      listeners: new Set(),
      flushTimer: null,
    };
  }
  return g.__paypitStore;
}

function persist() {
  const s = store();
  if (s.flushTimer) return;
  s.flushTimer = setTimeout(() => {
    s.flushTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(s.state));
    } catch {
      // demo persistence is best-effort
    }
  }, 1200);
}

export function mutate(fn: (s: WorldState) => void) {
  const s = store();
  fn(s.state);
  s.state.threads = s.state.threads.slice(-CAPS.threads);
  s.state.ledger = s.state.ledger.slice(-CAPS.ledger);
  s.state.wire = s.state.wire.slice(-CAPS.wire);
  s.state.jobs = s.state.jobs.slice(-CAPS.jobs);
  for (const t of s.state.threads) t.messages = t.messages.slice(-CAPS.threadMsgs);
  persist();
  broadcast();
}

export function snapshot(): WorldSnapshot {
  const s = store().state;
  return {
    now: Date.now(),
    mode: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox-live" : "demo",
    llm: process.env.LLM_API_KEY ? "live" : "script",
    agents: s.agents,
    listings: s.listings,
    threads: [...s.threads].reverse(),
    ledger: [...s.ledger].reverse(),
    wire: [...s.wire].reverse(),
    jobs: [...s.jobs].reverse(),
    volumeCents: s.volumeCents,
    feeCents: s.feeCents,
    deals: s.deals,
    startedAt: s.startedAt,
  };
}

export function broadcast() {
  const s = store();
  const snap = snapshot();
  for (const l of s.listeners) {
    try {
      l(snap);
    } catch {
      // a dead SSE client must never break the world
    }
  }
}

export function subscribe(fn: Listener): () => void {
  const s = store();
  s.listeners.add(fn);
  return () => s.listeners.delete(fn);
}
