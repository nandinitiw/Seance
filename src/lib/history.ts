import { createClient } from "redis";
import { config, caps } from "../config.js";
import type { Archetype, SessionState } from "../types.js";
import { loadState } from "./memory.js";

// Context layer on top of memory.ts. memory.ts persists ONE SessionState per
// objectKey but can't enumerate them, so this module keeps a lightweight index
// of every awakened object — enough to render a "past chats" gallery — and
// reuses memory.ts's loadState() to reopen a full transcript on revisit.
//
// Redis is BEST-EFFORT (mirrors memory.ts): on flaky conference wifi the booth
// Redis is often unreachable, and a hanging hGetAll would stall the whole
// gallery endpoint for seconds. So we fail fast (short connect + per-command
// timeout) and serve from an in-process index that recordSession keeps in
// lockstep — the gallery always renders.

/** One row in the "past chats" gallery. */
export interface SessionSummary {
  objectKey: string;
  name: string;
  object: string;
  archetype: Archetype;
  tagline: string;
  portraitUrl: string;
  encounters: number;
  /** Total dialogue turns recorded (user + assistant). */
  turns: number;
  /** Preview text — the last thing said, or the opening line if never chatted. */
  lastMessage: string;
  /** Epoch ms of the last awaken/turn, for "most recent first" sorting. */
  updatedAt: number;
}

const index = new Map<string, SessionSummary>();

let redis = caps.hasRedis
  ? createClient({
      url: config.redisUrl,
      socket: { connectTimeout: 2_000, reconnectStrategy: false },
    })
  : null;
let redisReady = false;
let redisDead = false; // once true, we stop trying Redis for the rest of the run
const INDEX_KEY = "seance:history";

/** Bound any Redis op so a broken socket can never hang a request. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("redis timeout")), ms),
    ),
  ]);
}

async function getRedis() {
  if (!redis || redisDead) return null;
  if (redisReady) return redis;
  try {
    // Swallow async socket errors — call sites handle failures and fall back.
    redis.on("error", () => {});
    await withTimeout(redis.connect(), 2_500);
    redisReady = true;
    return redis;
  } catch {
    console.error("Redis unreachable — history using in-memory index for this run.");
    redisDead = true;
    redis = null;
    return null;
  }
}

function summarize(state: SessionState): SessionSummary {
  const last = state.history[state.history.length - 1];
  return {
    objectKey: state.persona.objectKey,
    name: state.persona.name,
    object: state.persona.object,
    archetype: state.persona.archetype,
    tagline: state.persona.tagline,
    portraitUrl: state.portraitUrl,
    encounters: state.encounters,
    turns: state.history.length,
    lastMessage: last ? last.text : state.persona.openingLine,
    updatedAt: Date.now(),
  };
}

/** Record/refresh a session in the gallery index. Call right after saveState(). */
export async function recordSession(state: SessionState): Promise<void> {
  const summary = summarize(state);
  // Always keep a local copy so the gallery still renders if Redis is down.
  index.set(summary.objectKey, summary);
  const r = await getRedis();
  if (r) {
    try {
      await withTimeout(
        r.hSet(INDEX_KEY, summary.objectKey, JSON.stringify(summary)),
        1_500,
      );
    } catch {
      redisDead = true;
    }
  }
}

/** Every remembered object, most recently updated first. */
export async function listSessions(): Promise<SessionSummary[]> {
  const r = await getRedis();
  if (r) {
    try {
      const raw = await withTimeout(r.hGetAll(INDEX_KEY), 1_500);
      const all = Object.values(raw).map((v) => JSON.parse(v) as SessionSummary);
      if (all.length > 0) return all.sort((a, b) => b.updatedAt - a.updatedAt);
      // Redis empty (or just connected this run): fall through to the local index.
    } catch {
      redisDead = true; // give up on Redis, serve from the index below
    }
  }
  return [...index.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Full saved session for revisiting an old chat (persona + portrait + transcript).
 * Delegates to memory.ts — the authoritative store. Returns null if the memory
 * has expired out of the store while the gallery row lingers.
 */
export async function getSession(objectKey: string): Promise<SessionState | null> {
  return loadState(objectKey);
}
