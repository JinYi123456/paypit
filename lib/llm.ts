// LLM adapter — any OpenAI-compatible endpoint (free tiers: Gemini, Groq,
// OpenRouter, Featherless). Returns null on any failure so callers can fall
// back to the scripted engine. PayPit must always run, key or no key.

export type LlmPreset = "gemini" | "groq" | "openrouter" | "featherless" | "custom";

const PRESETS: Record<Exclude<LlmPreset, "custom">, { baseUrl: string; model: string }> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  featherless: {
    baseUrl: "https://api.featherless.ai/v1",
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  },
};

function config() {
  const provider = (process.env.LLM_PROVIDER || "gemini") as LlmPreset;
  const key = process.env.LLM_API_KEY || "";
  const preset = provider === "custom" ? undefined : PRESETS[provider as Exclude<LlmPreset, "custom">];
  const baseUrl = process.env.LLM_BASE_URL || preset?.baseUrl || "";
  const model = process.env.LLM_MODEL || preset?.model || "";
  return { key, baseUrl, model, enabled: Boolean(key && baseUrl && model) };
}

export function llmEnabled(): boolean {
  return config().enabled;
}

interface ChatOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/** Raw chat completion. Returns null on any error. */
export async function chat(opts: ChatOpts): Promise<string | null> {
  const { key, baseUrl, model, enabled } = config();
  if (!enabled) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 14000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.9,
        max_tokens: opts.maxTokens ?? 220,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Chat that must return a JSON object; null on failure. */
export async function chatJSON<T>(opts: ChatOpts): Promise<T | null> {
  const raw = await chat({
    ...opts,
    system: `${opts.system}\n\nReply with a single valid JSON object and nothing else. No markdown fences.`,
  });
  if (!raw) return null;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
