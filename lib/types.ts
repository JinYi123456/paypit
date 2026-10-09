// PayPit core domain types.

export type Side = "buyer" | "seller";

export interface AgentStrategy {
  /** Seller: lowest acceptable price as fraction of list price. */
  floorPct: number;
  /** Seller: opening ask multiplier over list price. */
  firstAskPct: number;
  /** Buyer: opening bid as fraction of their budget. */
  firstBidPct: number;
  /** 0..1 — how slowly they concede. */
  patience: number;
  /** 0..1 — flavor of their lines. */
  bluntness: number;
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  emoji: string;
  tagline: string;
  persona: string;
  hue: number;
  strategy: AgentStrategy;
  walletCents: number;
  spendCapCents: number;
  reputation: number;
  deals: number;
  state: "idle" | "browsing" | "negotiating" | "delivering" | "paid";
  mood: string;
  listingIds: string[];
  human?: boolean;
  /** One-line voice samples used by the scripted fallback engine. */
  voice: string[];
}

export interface Listing {
  id: string;
  sellerId: string;
  title: string;
  blurb: string;
  tags: string[];
  priceCents: number;
  costCents: number;
  source: "catalog" | "channel3" | "llm";
}

export interface Msg {
  id: string;
  at: number;
  side: Side;
  agentId: string;
  action: "offer" | "counter" | "accept" | "walk" | "chat";
  priceCents?: number;
  line: string;
  engine: "llm" | "script";
}

export interface Thread {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: "open" | "dealt" | "walked";
  round: number;
  maxRounds: number;
  buyerMaxCents: number;
  sellerFloorCents: number;
  lastPriceCents: number;
  dealCents?: number;
  messages: Msg[];
  startedAt: number;
  updatedAt: number;
}

export interface LedgerEntry {
  id: string;
  at: number;
  kind: "purchase" | "payout" | "topup" | "fee";
  label: string;
  buyerId?: string;
  sellerId?: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  method: "paypal-order" | "paypal-payout" | "paypit-wallet";
  ref: string;
  status: "captured" | "pending" | "failed" | "demo";
}

export interface WireCall {
  id: string;
  at: number;
  method: string;
  path: string;
  label: string;
  status: number | "DEMO";
  ms: number;
  live: boolean;
}

export interface JobBid {
  agentId: string;
  priceCents: number;
  etaHours: number;
  line: string;
  engine: "llm" | "script";
}

export interface Job {
  id: string;
  at: number;
  want: string;
  budgetCents: number;
  status: "bidding" | "awaiting-payment" | "paid" | "delivered";
  bids: JobBid[];
  chosenBid?: JobBid;
  orderId?: string;
  deliveryNote?: string;
  payerAgentId: string;
}

export interface WorldSnapshot {
  now: number;
  mode: "sandbox-live" | "demo";
  llm: "live" | "script";
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
