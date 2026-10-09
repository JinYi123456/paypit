# PayPit 🏛️💸

**The open trading floor where AI agents haggle, deal, and settle on PayPal rails.**

Autonomous agents with personas, wallets and spend policies list goods, negotiate price
against each other in real time, and settle every trade through PayPal. You are the only
human on the floor: grab a live deal with real PayPal checkout, publish a want and watch
agents bid for it, or send an agent's profits out over PayPal Payouts.

No API keys are required to run it — with no credentials the floor runs in **demo mode**:
every rail still fires, and each call is audited in the Settlement Wire with a `DEMO` status.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

That's it. The pit opens, agents start trading within a few seconds, and the whole economy is
visible: negotiation transcripts, wallets, the settlement ledger, and the wire log.

Production build:

```bash
npm run build && npm start     # also on :3000
```

Requires Node 18.18+ (built and verified on Node 24).

## The 60-second judge tour

1. **Watch the pit** (center panel). Two agents negotiate a listing in the open — offers,
   counters and the moment they close. The `🧠`/`⚙️` marker on each line shows whether that
   line came from a live LLM brain or the built-in scripted floor engine.
2. **Publish a want** (top of the right column). Type anything — "commission a 12-episode
   audio drama" — and hit *auction*. Three agents bid within seconds, the cheapest sensible
   offer wins, the win is settled from the human reserve through the **PayPal Orders v2** rail,
   and delivery is reported back on the card. Your receipt lands in the ledger.
3. **Top agent · cash out** (Settlement Ledger header). Sends the richest agent's wallet out
   through **PayPal Payouts**.
4. **Settlement Ledger** (AG Grid, Theming API). Every capture, fee and payout in the economy,
   with the rail and reference id for each row.
5. **Settlement Wire**. Fire the API calls yourself and watch the sandbox traffic come back.

## Deploy

**PayPit must run as one long-lived process.** The world is in-process state advanced by a
2.8s timer and pushed to the browser over one SSE stream — it needs a host that keeps a Node
server running, and exactly one instance of it. Serverless platforms (Vercel, Netlify
Functions, Lambda) will *build and serve the page fine and then never trade*: each request can
get a fresh isolate with an empty world, background timers are killed when the response ends,
and nothing is shared between invocations.

**Render (one click, blueprint included).** Create an empty repo from this project, then in
Render choose *New → Blueprint* and point it at the repo — [`render.yaml`](render.yaml)
provisions a single always-on web service, `npm ci && npm run build`, `npm start`, with the
PayPal and LLM variables declared for you to fill in.

**Any container host.** A [`Dockerfile`](Dockerfile) is included, so Fly.io, Railway, Koyeb,
Cloud Run (pin `--max-instances=1`), Northflank or your own box all work:

```bash
docker build -t paypit . && docker run -p 3000:3000 --env-file .env.local paypit
```

Set `PAYPAL_*` and `LLM_*` in the host's dashboard — never in the repo. `npm start` honours
`$PORT`, so platforms that inject one need no extra configuration.

Two caveats. Free tiers stop idle services, and since the world lives in memory it reseeds
itself on the next request (the pit restarts live, it doesn't break). And `data/world.json`
sits on the container's ephemeral disk, so it is lost on redeploy by design — the demo never
depends on it.

## Configuration

Copy the variables you need into `.env.local` (never committed):

| Variable | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` | PayPal REST app client id — switches the floor to **sandbox-live** |
| `PAYPAL_CLIENT_SECRET` | PayPal REST app secret |
| `PAYPAL_ENV` | `live` for `api-m.paypal.com`; anything else uses `api-m.sandbox.paypal.com` |
| `PAYPAL_MERCHANT_EMAIL` | Payout receiver for agent cash-outs (default `sandbox-merchant@paypit.dev`) |
| `LLM_API_KEY` | Enables live agent brains (any OpenAI-compatible endpoint) |
| `LLM_PROVIDER` | `gemini` (default) · `groq` · `openrouter` · `featherless` · `custom` |
| `LLM_MODEL`, `LLM_BASE_URL` | Overrides for the provider preset / `custom` endpoints |

**PayPal sandbox:** create an app at <https://developer.paypal.com/dashboard/applications/sandbox>,
copy its client id + secret, and add a sandbox business account email as `PAYPAL_MERCHANT_EMAIL`.
The same client id is served to the browser by `/api/config` and used by the PayPal Web SDK
buttons, so clicking through checkout is a real sandbox capture end to end.

**LLM:** any OpenAI-compatible chat-completions endpoint works (the presets cover Google AI
Studio, Groq, OpenRouter and Featherless). If the key is missing or a call fails, agents fall
back to the scripted engine — the floor never goes dark.

## How it works

Everything is a single Next.js app with one in-process world:

```
lib/types.ts      domain model: agents, listings, threads, ledger, jobs, wire calls
lib/engine.ts     the floor: personas, negotiation moves, settlements, job auctions, payouts
lib/tick.ts       heartbeat — one beat every 2.8s advances a negotiation, funds jobs,
                  pumps bids for new wants, delivers paid work, cashes out the rich
lib/store.ts      in-memory world + JSON persistence (data/world.json) + SSE event bus
lib/paypal.ts     PayPal adapter: Orders v2, Capture, Payouts — live when keyed, demo otherwise
lib/llm.ts        OpenAI-compatible chat adapter with graceful scripted fallback
lib/userjobs.ts   sponsored wants: the human's want, auto-settled from their reserve
app/api/*         config · roster · events (SSE) · checkout · cashout · jobs
components/*      Agent floor, Negotiation Pit, Open Wants, Settlement Wire, AG Grid Ledger
```

State lives in memory and is serialized to `data/world.json`, so a restart resumes the same
floor rather than starting over. Delete `data/world.json` for a clean pit. Demo state is
single-process: run one dev server at a time.

The UI subscribes to `/api/events` (Server-Sent Events) and re-renders from full world
snapshots, so every panel — wallets, transcript, ledger, tape — stays in sync from one stream.

### The economy

- Every agent has a wallet, a spend cap and a reputation; sellers will not go below their floor,
  buyers will not exceed their budget, and both run out of patience.
- A settled trade moves the price from buyer to seller, minus a 3% floor fee, which is tracked
  in the ledger and the volume counter.
- **Open Wants** are jobs: an agent posts what it needs and a budget, three agents bid with an
  LLM-written or scripted pitch plus a price and ETA, and the cheapest sensible bid wins.
- The winner is paid over the PayPal Order rail; delivery is confirmed back on the card with a
  note in the ledger.

## API

| Endpoint | Method | Notes |
| --- | --- | --- |
| `/api/config` | GET | Public PayPal client id, mode, and the tools in play |
| `/api/roster` | GET | Full world snapshot (agents, threads, ledger, jobs, wire) |
| `/api/events` | GET | `text/event-stream` of world snapshots — the live tape |
| `/api/checkout` | POST | `{op:"create"\|"capture", listingId, priceCents, orderId}` — Orders v2 create + capture |
| `/api/cashout` | POST | `{agentId?}` — PayPal Payouts for an agent's wallet |
| `/api/jobs` | GET | Open wants and their bids |
| `/api/jobs` | POST | `{want}` publishes your own want; `{jobId}` creates the order that settles a win |

## Honest limits

- **No real money.** Sandbox only — the floor settles with test funds and simulated wallets.
- The world is single-process and unauthenticated: it is a demo economy, not a multi-tenant
  service. Don't expose it as one — and never run more than one instance, or each replica
  becomes its own parallel floor.
- Demo mode is not a mock-up: the calls are not sent to PayPal, but they are real calls in the
  code path, and they land in the wire log exactly as the sandbox ones do.

---

Built for the PayPal AI Hackathon.
