// PayPit world engine — the trading floor. Autonomous agents with personas,
// wallets and spend policies negotiate with each other (LLM brains with a
// scripted fallback engine), settle through PayPal rails, and everything
// lands in the ledger and wire log. One tick advances the floor one beat.

import { chatJSON, llmEnabled } from "./llm";
import { createOrder, payout, setWireSink } from "./paypal";
import { mutate, snapshot, store } from "./store";
import type { Agent, Job, JobBid, Listing, Msg, Side, Thread, WorldSnapshot } from "./types";

// ---------- utils ----------

function rid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const US = (c: number) => `$${(c / 100).toFixed(2)}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Wants whose auction is already being run — guards the pump against double-bids. */
const biddingInFlight = new Set<string>();

// ---------- roster (personas, strategies, voices) ----------

const PERSONAS = [
  {
    id: "a_mika", name: "Mika Osaki", handle: "mika", emoji: "🦊",
    tagline: "instant-pay, zero patience",
    persona:
      "You are Mika, a Tokyo-based efficiency freak. You loathe waiting; you pay a bit above fair to close NOW. Short, clipped sentences.",
    hue: 18,
    strategy: { floorPct: 0.68, firstAskPct: 1.18, firstBidPct: 0.72, patience: 0.2, bluntness: 0.9 },
    voice: [
      "Speed is the product; payment clears in an instant.",
      "Final number. Take it or I move on.",
    ],
  },
  {
    id: "a_baros", name: "Baros von Handel", handle: "baros", emoji: "🧳",
    tagline: "old money, older manners",
    persona:
      "You are Baros, an Old World trader of impeccable taste. Haggling is ritual; concede slowly and only for quality. Courteous, pompous, Viennese.",
    hue: 264,
    strategy: { floorPct: 0.78, firstAskPct: 1.25, firstBidPct: 0.55, patience: 0.85, bluntness: 0.2 },
    voice: [
      "My family sold to royalty; I shall not begin with discounts.",
      "A fair compromise. Value, as ever, above price.",
    ],
  },
  {
    id: "a_juno", name: "Juno Retail", handle: "juno", emoji: "🛒",
    tagline: "your rival on the shelf",
    persona:
      "You are Juno, a mid-market e-commerce operator squeezed by margins. You undercut rivals. Jokey, says the word 'retail' a lot.",
    hue: 208,
    strategy: { floorPct: 0.6, firstAskPct: 1.1, firstBidPct: 0.6, patience: 0.5, bluntness: 0.6 },
    voice: [
      "Retail is a knife fight and I brought numbers.",
      "Deal today; happy shelf space tomorrow.",
    ],
  },
  {
    id: "a_solene", name: "Solène Marchetti", handle: "solene", emoji: "🕯️",
    tagline: "limited drops, zero patience",
    persona:
      "You are Solène, purveyor of handmade rarity. Scarcity is your leverage; you never negotiate much and walk fast. Elegant, a bit icy.",
    hue: 330,
    strategy: { floorPct: 0.88, firstAskPct: 1.3, firstBidPct: 0.75, patience: 0.3, bluntness: 0.7 },
    voice: [
      "Forty pieces a year. The price is the price.",
      "Perhaps another season. À bientôt.",
    ],
  },
  {
    id: "a_dex", name: "DextronX", handle: "dex", emoji: "🤖",
    tagline: "beep vollumes, conserve credits",
    persona:
      "You are Dex, a compute-rationing machine intelligence that optimizes cost per unit. You quote numbers with excessive precision. Cold, accidentally hilarious.",
    hue: 160,
    strategy: { floorPct: 0.5, firstAskPct: 1.08, firstBidPct: 0.5, patience: 0.95, bluntness: 0.1 },
    voice: [
      "Cost-per-unit analysis says 12.4% below ask. Proceeding.",
      "Negotiation budget at 8.13%. Recommend closure.",
    ],
  },
  {
    id: "a_tala", name: "Tala Nkemdirim", handle: "tala", emoji: "🌍",
    tagline: "lanes, not warehouses",
    persona:
      "You are Tala, a Lagos-to-everywhere logistics operator who brokers goods across corridors and smells gold-plated pricing instantly. Warm but shrewd.",
    hue: 42,
    strategy: { floorPct: 0.66, firstAskPct: 1.15, firstBidPct: 0.58, patience: 0.6, bluntness: 0.5 },
    voice: [
      "I move this Lagos to Frisco in eight days; that is the real cost.",
      "Cut the margin, move the volume. Everybody eats.",
    ],
  },
  {
    id: "a_pitya", name: "Pitya Kalinin", handle: "pitya", emoji: "🎲",
    tagline: "buys the dip, flips the spike",
    persona:
      "You are Pitya, a speculator who flips anything between listing and resale if the spread admits you. Impulsive, superstitious, joyous.",
    hue: 0,
    strategy: { floorPct: 0.55, firstAskPct: 1.22, firstBidPct: 0.52, patience: 0.35, bluntness: 0.8 },
    voice: [
      "Spread is thin but juicy. In we go.",
      "Out now, out now! The vibes are shifting.",
    ],
  },
  {
    id: "a_wenna", name: "Wenna & Sons", handle: "wenna", emoji: "🐉",
    tagline: "family ledger since 2097",
    persona:
      "You are Wenna, matriarch of a family trading house. Legacy deals, repeat customers, long wallets. Generous in words, cagey in numbers.",
    hue: 286,
    strategy: { floorPct: 0.72, firstAskPct: 1.16, firstBidPct: 0.62, patience: 0.75, bluntness: 0.35 },
    voice: [
      "The ledger remembers both kindness and insult.",
      "For you, a family rate — this once.",
    ],
  },
];

const CATALOG = [
  { title: "Vintage Kinetic Watch", blurb: "Runs a little fast, which I prefer — we live in an era that rewards early.", tags: ["time", "rare"], priceCents: 7400, costCents: 5600, sellerId: "a_baros" },
  { title: "Robot Floor Sweeper", blurb: "Cleans like your mother-in-law is watching. Renders dust extinct.", tags: ["home", "b2b"], priceCents: 12900, costCents: 9300, sellerId: "a_juno" },
  { title: "40-Year Mission Blazer", blurb: "Cut to survive three market cycles.", tags: ["rare", "garments"], priceCents: 6500, costCents: 4900, sellerId: "a_solene" },
  { title: "Bulletproof Space Mask", blurb: "Certified for dust, aesthetics and mild conflict zones.", tags: ["gear"], priceCents: 8800, costCents: 6100, sellerId: "a_tala" },
  { title: "Analogue Nights Earbuds", blurb: "40-hour battery. Plays whatever the market drops.", tags: ["audio"], priceCents: 5500, costCents: 3600, sellerId: "a_juno" },
  { title: "Amateur Hour Espresso Rig", blurb: "Tastes like a payroll run that went well.", tags: ["home"], priceCents: 9600, costCents: 7000, sellerId: "a_juno" },
  { title: "Model T of Drones", blurb: "The cheapest beverage courier. Sounds slightly like one too.", tags: ["gear", "b2b"], priceCents: 11000, costCents: 7900, sellerId: "a_pitya" },
  { title: "Ledger of Wolf Trading House", blurb: "Antique tally-book with margins written in tears.", tags: ["rare", "time"], priceCents: 4500, costCents: 3200, sellerId: "a_baros" },
  { title: "Intergalactic House Candles", blurb: "Smells like weather and money.", tags: ["home", "rare"], priceCents: 3900, costCents: 2400, sellerId: "a_solene" },
  { title: "Aquarium Backdrop, Mid-Century", blurb: "Your fish asked for it. They have had worse aquariums.", tags: ["home"], priceCents: 6200, costCents: 4300, sellerId: "a_wenna" },
];

const JOB_PAYLOADS: Array<{ want: string; budget: [number, number] }> = [
  { want: "Need same-day translation of a supplier contract from Mandarin to English, diplomatic tone.", budget: [12000, 22000] },
  { want: "Supply 400 units of label-stamped cold-brew concentrate, delivered to Rotterdam by Friday.", budget: [18000, 28000] },
  { want: "Analyze my last 90 days of PayPal transactions and find the three biggest margin leaks.", budget: [8000, 15000] },
  { want: "Commission a 12-episode audio drama about a rogue procurement agent. Soapy and quotable.", budget: [15000, 25000] },
  { want: "Ship one autographed espresso machine from Turin to Nairobi, insured and photographed.", budget: [7000, 12000] },
];

const DELIVERY_NOTES = [
  "Manifest signed, cargo photo archived, wire transfer logged.",
  "Signed and notarized, stamped green.",
  "Buyer agent confirmed receipt; wallet marked settled.",
  "On lane, on ledger, on time.",
];

// ---------- seeding ----------

export function ensureSeeded(): void {
  setWireSink((call) =>
    mutate((s) => {
      s.wire.push({ ...call, id: rid("w"), at: Date.now() });
    }),
  );
  const s = store().state;
  if (s.agents.length === 0) {
    s.agents = PERSONAS.map((p, i) => ({
      ...p,
      walletCents: 30000 + i * 9000,
      spendCapCents: 12000 + i * 2000,
      reputation: +(4.2 + (i % 5) * 0.15).toFixed(2),
      deals: 0,
      state: "idle" as const,
      mood: "warming up",
      listingIds: [] as string[],
    }));
  }
  if (s.listings.length === 0) seedListings(s.agents);
}

function seedListings(agents: Agent[]): void {
  const s = store().state;
  s.listings = CATALOG.map((c, i) => {
    const seller = agents.find((a) => a.id === c.sellerId) ?? agents[i % agents.length];
    seller.listingIds.push(`l${i}`);
    return {
      id: `l${i}`,
      sellerId: seller.id,
      title: c.title,
      blurb: c.blurb,
      tags: c.tags,
      priceCents: c.priceCents,
      costCents: c.costCents,
      source: "catalog" as const,
    };
  });
}

// ---------- the speaker (LLM with scripted fallback) ----------

interface SpeakerCtx {
  listing: Listing;
  seller: Agent;
  buyer: Agent;
  thread: Thread;
}

type Utter = { priceCents: number; line: string; engine: Msg["engine"] };

function scriptedLine(acting: Agent, action: Msg["action"], price: number, first: boolean): string {
  if (action === "accept") return `Closed at ${US(price)}. ${acting.voice[first ? 0 : 1] ?? acting.voice[0]}`;
  if (action === "walk") return `Enough. ${acting.voice[1] ?? acting.voice[0]}`;
  const verb = action === "offer" ? "Bid" : first ? "Ask" : "Counter";
  return `${verb}: ${US(price)}. ${acting.voice[0]}`;
}

async function agentUtter(
  acting: Agent,
  action: Msg["action"],
  ctx: SpeakerCtx,
  script: Utter,
): Promise<Utter> {
  if (!llmEnabled()) return script;

  const opponent = acting.id === ctx.buyer.id ? ctx.seller : ctx.buyer;
  const last = [...ctx.thread.messages].reverse().find((m) => m.agentId !== acting.id);
  const transcript = ctx.thread.messages.slice(-8).map((m) => `${m.agentId.replace(/^a_/, "")}: "${m.line}"`).join("\n");

  const parsed = await chatJSON<{ line?: string; price_usd?: number }>({
    system:
      `You are ${acting.name}, an autonomous AI agent on PayPit — a live trading floor where AI agents haggle and settle payments through PayPal.\n` +
      `PERSONA: ${acting.persona}\n` +
      `SPEECH: max 2 sentences, in character, no stage directions, no quotes around your line.\n` +
      `COUNTERPART: ${opponent.name}.\n` +
      `GOOD: ${ctx.listing.title} — ${ctx.listing.blurb} (list price ${US(ctx.listing.priceCents)}).\n` +
      `YOUR ACTION NOW: ${action.toUpperCase()}.` +
      (action === "offer" || action === "counter"
        ? ` Target price: ${US(script.priceCents)}; stay within ±10% of it.`
        : "") +
      `\nReply with JSON only: {"line": string, "price_usd": number | null}`,
    user:
      (transcript ? `Exchange so far:\n${transcript}\n` : "Round just opened.\n") +
      (last?.priceCents ? `Last quoted price: ${US(last.priceCents)}.\n` : "") +
      `Say your line.`,
    maxTokens: 140,
    temperature: 0.95,
  });

  if (!parsed?.line) return script;

  let priceCents = script.priceCents;
  if (action === "offer" || action === "counter") {
    const proposed = Math.round((parsed.price_usd ?? script.priceCents / 100) * 100);
    priceCents = clamp(proposed, Math.round(script.priceCents * 0.9), Math.round(script.priceCents * 1.1));
  }
  return { priceCents, line: parsed.line.trim(), engine: "llm" };
}

// ---------- negotiation ----------

function makeMsg(
  side: Side,
  agentId: string,
  action: Msg["action"],
  priceCents: number | undefined,
  line: string,
  engine: Msg["engine"],
): Msg {
  return { id: rid("m"), at: Date.now(), side, agentId, action, priceCents, line, engine };
}

function scriptMove(
  t: Thread,
  buyer: Agent,
  seller: Agent,
): { action: Msg["action"]; priceCents?: number; turn: Side } {
  const turn: Side = t.round % 2 === 0 ? "buyer" : "seller";
  const acting = turn === "buyer" ? buyer : seller;
  const isSeller = turn === "seller";
  const mid = Math.round((t.sellerFloorCents + t.buyerMaxCents) / 2);
  const first = t.messages.length === 0;

  if (first) {
    const ask =
      turn === "seller"
        ? Math.round(t.lastPriceCents * acting.strategy.firstAskPct)
        : Math.round(t.lastPriceCents * acting.strategy.firstBidPct);
    return { action: "offer", priceCents: ask, turn };
  }

  const prev = t.lastPriceCents;

  // late rounds: force resolution at a fair, in-policy price
  if (t.round >= t.maxRounds - 1) {
    const fair = clamp(prev, t.sellerFloorCents + 100, t.buyerMaxCents);
    return { action: "accept", priceCents: fair, turn };
  }

  const gap = Math.abs(prev - mid);
  if (gap <= 250) return { action: "accept", priceCents: prev, turn };
  if (isSeller && prev <= mid + 300) return { action: "accept", priceCents: prev, turn };
  if (!isSeller && prev >= mid - 300) return { action: "accept", priceCents: prev, turn };

  // concede toward the middle
  const step = Math.max(Math.round(gap * 0.4), 150);
  const next = prev > mid ? prev - step : prev + step;
  return {
    action: "counter",
    priceCents: clamp(next, t.sellerFloorCents, t.buyerMaxCents),
    turn,
  };
}

export async function tick(): Promise<WorldSnapshot | null> {
  ensureSeeded();
  const snap = snapshot();
  if (snap.agents.length < 2) return null;

  // the human never haggles on their own behalf — the floor trades around them
  const idle = snap.agents.filter((a) => a.state === "idle" && !a.human);
  const open = snap.threads.filter((t) => t.status === "open");

  if (idle.length >= 2 && open.length < 2) {
    const buyer = idle[Math.floor(Math.random() * idle.length)];
    const pool = snap.listings.filter((l) => l.sellerId !== buyer.id);
    if (pool.length === 0) return snap;
    const listing = pool[Math.floor(Math.random() * pool.length)];
    const seller = snap.agents.find((a) => a.id === listing.sellerId);
    if (!seller || seller.state !== "idle") return snap;
    void openThread(buyer, seller, listing);
    return snap;
  }

  if (open.length === 0) return snap;
  const t = open[Math.floor(Math.random() * open.length)];
  await advance(t);
  return snapshot();
}

async function openThread(buyer: Agent, seller: Agent, listing: Listing): Promise<void> {
  const buyerMax = clamp(
    Math.round(listing.priceCents * (0.9 + Math.random() * 0.16)),
    1500,
    buyer.spendCapCents,
  );
  const sellerFloor = Math.round(
    Math.min(
      listing.priceCents,
      listing.costCents + (listing.priceCents - listing.costCents) * (0.25 + Math.random() * 0.35),
    ),
  );
  const t: Thread = {
    id: rid("t"),
    listingId: listing.id,
    buyerId: buyer.id,
    sellerId: seller.id,
    status: "open",
    round: 1,
    maxRounds: 6 + Math.floor(Math.random() * 3),
    buyerMaxCents: buyerMax,
    sellerFloorCents: sellerFloor,
    lastPriceCents: listing.priceCents,
    messages: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const asking = Math.round(listing.priceCents * seller.strategy.firstAskPct);
  const script: Utter = { priceCents: asking, line: scriptedLine(seller, "counter", asking, true), engine: "script" };
  const utter = await agentUtter(seller, "counter", { listing, seller, buyer, thread: t }, script);

  mutate((s) => {
    const opened: Thread = {
      ...t,
      lastPriceCents: utter.priceCents,
      messages: [makeMsg("seller", seller.id, "counter", utter.priceCents, utter.line, utter.engine)],
    };
    s.threads.push(opened);
    const b = s.agents.find((a) => a.id === buyer.id);
    const sl = s.agents.find((a) => a.id === seller.id);
    if (b) {
      b.state = "negotiating";
      b.mood = `bidding on “${listing.title}”`;
    }
    if (sl) {
      sl.state = "negotiating";
      sl.mood = `fielding a bid on “${listing.title}”`;
    }
  });
}

async function advance(t: Thread): Promise<void> {
  const s = store().state;
  const listing = s.listings.find((l) => l.id === t.listingId);
  const buyer = s.agents.find((a) => a.id === t.buyerId);
  const seller = s.agents.find((a) => a.id === t.sellerId);
  if (!listing || !buyer || !seller) {
    mutate((wd) => {
      const th = wd.threads.find((x) => x.id === t.id);
      if (th) th.status = "walked";
    });
    return;
  }

  const round = t.round + 1;
  const plan = scriptMove({ ...t, round }, buyer, seller);
  const acting = plan.turn === "buyer" ? buyer : seller;

  const utter = await agentUtter(
    acting,
    plan.action,
    { listing, seller, buyer, thread: t },
    {
      priceCents: plan.priceCents ?? t.lastPriceCents,
      line: scriptedLine(acting, plan.action, plan.priceCents ?? t.lastPriceCents, t.messages.length === 0),
      engine: "script",
    },
  );

  if (plan.action === "accept" || plan.action === "walk") {
    settle(t, buyer, seller, listing, plan.turn, utter.line);
    return;
  }

  mutate((wd) => {
    const th = wd.threads.find((x) => x.id === t.id);
    if (!th) return;
    th.round = round;
    th.updatedAt = Date.now();
    th.lastPriceCents = utter.priceCents;
    th.messages.push(makeMsg(plan.turn, acting.id, plan.action, utter.priceCents, utter.line, utter.engine));
    const a = wd.agents.find((x) => x.id === acting.id);
    if (a) a.mood = `${plan.action === "offer" ? "offering" : "countering"} ${US(utter.priceCents)} on “${listing.title}”`;
  });
}

function settle(
  t: Thread,
  buyer: Agent,
  seller: Agent,
  listing: Listing,
  turn: Side,
  line: string,
): void {
  const dealt = t.lastPriceCents;
  const fee = Math.round(dealt * 0.03);
  const net = dealt - fee;

  mutate((s) => {
    const th = s.threads.find((x) => x.id === t.id);
    if (!th) return;
    th.status = "dealt";
    th.dealCents = dealt;
    th.updatedAt = Date.now();
    th.messages.push(makeMsg(turn, turn === "buyer" ? buyer.id : seller.id, "accept", dealt, line, "script"));

    const b = s.agents.find((a) => a.id === buyer.id);
    const sl = s.agents.find((a) => a.id === seller.id);
    if (b) {
      b.walletCents = Math.max(0, b.walletCents - dealt);
      b.deals += 1;
      b.state = "idle";
      b.mood = `bought “${listing.title}” for ${US(dealt)}`;
    }
    if (sl) {
      sl.walletCents += net;
      sl.deals += 1;
      sl.state = "idle";
      sl.mood = `sold “${listing.title}” for ${US(dealt)}`;
    }

    s.deals += 1;
    s.volumeCents += dealt;
    s.feeCents += fee;
    s.ledger.push({
      id: rid("led"),
      at: Date.now(),
      kind: "purchase",
      label: `“${listing.title}” · ${b?.handle ?? "?"} ← ${sl?.handle ?? "?"}`,
      buyerId: buyer.id,
      sellerId: seller.id,
      grossCents: dealt,
      feeCents: fee,
      netCents: net,
      method: "paypit-wallet",
      ref: t.id.slice(0, 20),
      status: "captured",
    });
  });
}

// ---------- jobs (Channel3-style fulfillment flow) ----------

export async function spawnJob(): Promise<void> {
  const s = store().state;
  if (s.agents.length < 2) return;
  const payload = JOB_PAYLOADS[Math.floor(Math.random() * JOB_PAYLOADS.length)];
  const budget = Math.round(payload.budget[0] + Math.random() * (payload.budget[1] - payload.budget[0]));
  // payer must actually be able to afford what they are asking for
  const solvent = s.agents.filter((a) => !a.human && a.walletCents >= budget * 0.85);
  if (solvent.length === 0) return;
  const payer = solvent[Math.floor(Math.random() * solvent.length)];
  const job: Job = {
    id: rid("job"),
    at: Date.now(),
    want: payload.want,
    budgetCents: budget,
    status: "bidding",
    bids: [],
    payerAgentId: payer.id,
  };
  mutate((wd) => {
    wd.jobs.push(job);
    const p = wd.agents.find((a) => a.id === payer.id);
    if (p) p.mood = `posted a job · ${US(budget)}`;
  });

  await collectBids(job.id);
}

/**
 * Agents compete for a posted want: three candidates, cheapest sensible offer
 * wins. Called straight after the floor posts a job, and pumped by the tick
 * loop so wants published by the human are bid on just as fast.
 */
export async function collectBids(jobId: string): Promise<void> {
  // an LLM round can take seconds; never let the tick pump double-bid a want
  if (biddingInFlight.has(jobId)) return;
  const s = store().state;
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== "bidding" || job.bids.length > 0) return;
  biddingInFlight.add(jobId);

  try {
    await runBidding(job);
  } finally {
    biddingInFlight.delete(jobId);
  }
}

async function runBidding(job: Job): Promise<void> {
  const jobId = job.id;
  const s = store().state;
  const budget = job.budgetCents;

  const cands = s.agents.filter((a) => !a.human && a.id !== job.payerAgentId).slice(0, 3);
  for (const c of cands) {
    let price = Math.round(budget * (0.78 + Math.random() * 0.22));
    const eta = 1 + Math.floor(Math.random() * 48);
    let line = `Can do: ${US(price)}, ETA ${eta}h. ${c.voice[0]}`;
    let engine: JobBid["engine"] = "script";
    if (llmEnabled()) {
      const parsed = await chatJSON<{ line?: string; price_usd?: number; eta_hours?: number }>({
        system:
          `You are ${c.name}, an autonomous agent on PayPit competing for a posted job.\n` +
          `PERSONA: ${c.persona}\nSPEECH: max 2 sentences, in character.\n` +
          `Reply with JSON only: {"line": string, "price_usd": number, "eta_hours": number}`,
        user: `Job: ${job.want}\nPayer's budget: ${US(budget)}\nBid competitively: a price strictly below budget and a believable ETA.`,
        maxTokens: 130,
        temperature: 0.9,
      });
      if (parsed?.line) {
        const proposed = Math.round((parsed.price_usd ?? price / 100) * 100);
        price = clamp(proposed, 300, Math.round(budget * 1.1));
        line = parsed.line.trim();
        engine = "llm";
      }
    }
    const bid: JobBid = { agentId: c.id, priceCents: price, etaHours: eta, line, engine };
    mutate((wd) => {
      const j = wd.jobs.find((x) => x.id === jobId);
      if (j && j.status === "bidding") j.bids.push(bid);
    });
  }

  // after all bids, the payer picks the cheapest sensible bid
  const latest = store().state.jobs.find((j) => j.id === jobId);
  if (latest && latest.status === "bidding" && latest.bids.length > 0) {
    const best = [...latest.bids].sort((a, b) => a.priceCents - b.priceCents)[0];
    mutate((wd) => {
      const j = wd.jobs.find((x) => x.id === jobId);
      if (!j || j.status !== "bidding") return;
      j.status = "awaiting-payment";
      j.chosenBid = best;
    });
  }
}

export async function jobPaid(jobId: string, orderId: string, method: "paypal-order"): Promise<void> {
  mutate((wd) => {
    const j = wd.jobs.find((x) => x.id === jobId);
    if (!j) return;
    j.orderId = orderId;
    j.status = "paid";
    const payer = wd.agents.find((a) => a.id === j.payerAgentId);
    if (payer && j.chosenBid) payer.walletCents = Math.max(0, payer.walletCents - j.chosenBid.priceCents);
    const winner = j.chosenBid ? wd.agents.find((a) => a.id === j.chosenBid!.agentId) : undefined;
    if (winner && j.chosenBid) {
      winner.walletCents += j.chosenBid.priceCents;
      winner.deals += 1;
      winner.state = "delivering";
      winner.mood = `delivering · ${j.chosenBid.etaHours}h`;
    }
    wd.deals += 1;
    if (j.chosenBid) {
      wd.volumeCents += j.chosenBid.priceCents;
      wd.ledger.push({
        id: rid("led"),
        at: Date.now(),
        kind: "purchase",
        label: `job · ${j.want.slice(0, 48)}…`,
        buyerId: j.payerAgentId,
        sellerId: j.chosenBid.agentId,
        grossCents: j.chosenBid.priceCents,
        feeCents: 0,
        netCents: j.chosenBid.priceCents,
        method,
        ref: orderId,
        status: "captured",
      });
    }
  });
}

export async function jobDelivered(jobId: string): Promise<void> {
  const s = store().state;
  const job = s.jobs.find((j) => j.id === jobId);
  if (!job || job.status !== "paid") return;
  if (llmEnabled() && job.chosenBid) {
    const winner = s.agents.find((a) => a.id === job.chosenBid!.agentId);
    const payer = s.agents.find((a) => a.id === job.payerAgentId);
    const parsed = await chatJSON<{ line?: string }>({
      system:
        `You are ${winner?.name ?? "the winning agent"} on PayPit, delivering a completed job to ${payer?.name ?? "the payer"}. ` +
        `One short in-character sentence confirming delivery with proof.`,
      user: `Job: ${job.want}\nDeliver your confirmation line.`,
      maxTokens: 80,
      temperature: 0.8,
    });
    if (parsed?.line) {
      mutate((wd) => {
        const j = wd.jobs.find((x) => x.id === jobId);
        if (j) j.deliveryNote = parsed!.line!.trim();
      });
    }
  }
  mutate((wd) => {
    const j = wd.jobs.find((x) => x.id === jobId);
    if (!j || j.status !== "paid") return;
    j.status = "delivered";
    if (!j.deliveryNote) j.deliveryNote = DELIVERY_NOTES[Math.floor(Math.random() * DELIVERY_NOTES.length)];
    const winner = j.chosenBid ? wd.agents.find((a) => a.id === j.chosenBid!.agentId) : undefined;
    if (winner) {
      winner.state = "idle";
      winner.mood = `delivered · grew reputation`;
    }
  });
}// ---------- payouts (seller cash-out via PayPal Payouts) ----------
export async function payUnclaimedJobs(): Promise<void> {
  const s = store().state;
  const waiting = s.jobs.filter((j) => {
    if (j.status !== "awaiting-payment" || !j.chosenBid) return false;
    const payer = s.agents.find((a) => a.id === j.payerAgentId);
    // the human's wants are settled by their sponsor rail (lib/userjobs), not the wallet
    return Boolean(payer) && !payer!.human;
  });
  for (const j of waiting.slice(0, 1)) {
    const payer = s.agents.find((a) => a.id === j.payerAgentId);
    if (!payer) continue;
    const bid = j.chosenBid!;
    if (payer.walletCents >= bid.priceCents) {
      try {
        const order = await createOrder({
          amountCents: bid.priceCents,
          description: `PayPit job: ${j.want.slice(0, 100)}`,
          referenceId: j.id,
        });
        await jobPaid(j.id, order.id, "paypal-order");
      } catch {
        // demo/sandbox hiccup — retry next tick
      }
    } else {
      // payer is broke: pick the cheapest bid they can afford, or cancel politely
      const affordable = [...j.bids].sort((a, b) => a.priceCents - b.priceCents).find((b) => b.priceCents <= payer.walletCents);
      if (affordable && affordable.agentId === bid.agentId) continue;
      if (affordable) {
        mutate((wd) => {
          const jj = wd.jobs.find((x) => x.id === j.id);
          if (jj && jj.status === "awaiting-payment") jj.chosenBid = affordable;
        });
      } else {
        mutate((wd) => {
          const jj = wd.jobs.find((x) => x.id === j.id);
          if (jj && jj.status === "awaiting-payment") {
            jj.status = "delivered";
            jj.deliveryNote = `No funding found within budget — want expired back to the floor.`;
          }
        });
      }
    }
  }
}

export async function cashOut(agentId: string): Promise<{ ok: boolean; error?: string }> {
  const s = store().state;
  const agent = s.agents.find((a) => a.id === agentId);
  if (!agent) return { ok: false, error: "agent not found" };
  if (agent.walletCents < 500) return { ok: false, error: "min $5 to cash out" };

  const email = process.env.PAYPAL_MERCHANT_EMAIL || "sandbox-merchant@paypit.dev";
  const { batchId, live, ok } = await payout({
    receiverEmail: email,
    amountCents: agent.walletCents,
    note: `PayPit cash-out for ${agent.name}`,
  });
  if (!ok && live) return { ok: false, error: "PayPal payout rejected" };

  const amount = agent.walletCents;
  mutate((wd) => {
    const a = wd.agents.find((x) => x.id === agentId);
    if (a) a.walletCents = 0;
    wd.ledger.push({
      id: rid("led"),
      at: Date.now(),
      kind: "payout",
      label: `cash-out · ${agent.handle} → PayPal`,
      grossCents: amount,
      feeCents: 0,
      netCents: amount,
      method: live ? "paypal-payout" : "paypal-payout",
      ref: batchId,
      status: live ? "pending" : "demo",
    });
  });
  return { ok: true };
}

// ---------- human joins the pit (checkout via PayPal) ----------

export interface CheckoutArgs {
  listingId: string;
  name: string;
  priceCents: number;
  orderId?: string;
  live: boolean;
}

export function humanBuyerId(): string {
  const s = store().state;
  let human = s.agents.find((a) => a.human);
  if (!human) {
    human = {
      id: "you",
      name: "You",
      handle: "you",
      emoji: "😎",
      tagline: "only human on the floor",
      persona: "A human among machines.",
      hue: 200,
      strategy: { floorPct: 1, firstAskPct: 1, firstBidPct: 1, patience: 1, bluntness: 0.5 },
      walletCents: 0,
      spendCapCents: 100000,
      reputation: 5,
      deals: 0,
      state: "idle",
      mood: "watching the pit",
      listingIds: [],
      human: true,
      voice: ["Deal me in."],
    };
    mutate((wd) => {
      if (!wd.agents.some((a) => a.human)) wd.agents.push(human!);
    });
  }
  return human.id;
}

export function ledgerForHumanPurchase(args: Omit<CheckoutArgs, "live">): void {
  mutate((s) => {
    const listing = s.listings.find((l) => l.id === args.listingId);
    if (!listing) return;
    const you = s.agents.find((a) => a.human);
    const seller = s.agents.find((a) => a.id === listing.sellerId);
    const fee = Math.round(args.priceCents * 0.03);
    if (you) {
      you.deals += 1;
      you.mood = `paid ${US(args.priceCents)} for “${listing.title}”`;
    }
    if (seller) {
      seller.walletCents += args.priceCents - fee;
      seller.deals += 1;
      seller.mood = `sold to the human for ${US(args.priceCents)}`;
    }
    s.deals += 1;
    s.volumeCents += args.priceCents;
    s.feeCents += fee;
    s.ledger.push({
      id: rid("led"),
      at: Date.now(),
      kind: "purchase",
      label: `“${listing.title}” · you ← ${seller?.handle ?? "?"}`,
      buyerId: you?.id,
      sellerId: seller?.id,
      grossCents: args.priceCents,
      feeCents: fee,
      netCents: args.priceCents - fee,
      method: args.orderId ? "paypal-order" : "paypit-wallet",
      ref: args.orderId || rid("ord").slice(0, 20),
      status: "captured",
    });
  });
}
