import { config as dotenvLoad } from "dotenv";
// Load .env.local first (gitignored, has real keys), then .env as fallback.
dotenvLoad({ path: ".env.local" });
dotenvLoad();

/**
 * Central config + capability flags. Reading env in ONE place means every module
 * can ask `config.hasAnthropic` instead of poking at process.env, and the
 * mock-vs-real decision is made consistently.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),

  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Opus 4.8 — strong vision + structured output for inventing the persona.
  // For the low-latency chat loop you could drop to claude-haiku-4-5; see claude.ts.
  anthropicModel: "claude-opus-4-8" as const,

  deepgramKey: process.env.DEEPGRAM_API_KEY ?? "",
  deepgramTtsModel: process.env.DEEPGRAM_TTS_MODEL ?? "aura-2-thalia-en",
  deepgramSttModel: process.env.DEEPGRAM_STT_MODEL ?? "nova-3",

  imageProvider: (process.env.IMAGE_PROVIDER ?? "mock") as
    | "mock"
    | "firefly"
    | "midjourney"
    | "gemini",
  fireflyClientId: process.env.ADOBE_FIREFLY_CLIENT_ID ?? "",
  fireflyClientSecret: process.env.ADOBE_FIREFLY_CLIENT_SECRET ?? "",
  midjourneyProxyUrl: process.env.MIDJOURNEY_PROXY_URL ?? "",
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-preview-image",

  redisUrl: process.env.REDIS_URL ?? "",
};

export const caps = {
  get hasAnthropic() {
    return Boolean(config.anthropicKey);
  },
  get hasDeepgram() {
    return Boolean(config.deepgramKey);
  },
  get hasRedis() {
    return Boolean(config.redisUrl);
  },
};

/** Pretty-print which hops are live vs mocked, so you know what to wire next. */
export function logCapabilities() {
  const flag = (on: boolean) => (on ? "live " : "mock ");
  console.log("┌─ Séance capabilities ─────────────────");
  console.log(`│ ${flag(caps.hasAnthropic)} persona  (Anthropic)`);
  console.log(`│ ${flag(caps.hasDeepgram)} voice    (Deepgram)`);
  console.log(`│ ${flag(config.imageProvider !== "mock")} portrait (${config.imageProvider})`);
  console.log(`│ ${flag(caps.hasRedis)} memory   (Redis)`);
  console.log("└───────────────────────────────────────");
}
