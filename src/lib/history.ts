import { createClient } from "redis";
import { config, caps } from "../config.js";
import type { Archetype, SessionState } from "../types.js";
import { loadState } from "./memory.js";

// Context layer on top of memory.ts. memory.ts persists ONE SessionState per
// objectKey but can't enumerate them, so this module keeps a lightweight index
// of every awakened object — enough to render a "past chats" gallery — and
// reuses memory.ts's loadState() to reopen a full transcript on revisit.
//
// Storage mirrors memory.ts: Redis when REDIS_URL is set (survives restarts),
// otherwise an in-process Map (resets with the process, in lockstep with the
// in-memory store memory.ts falls back to).

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
const redis = caps.hasRedis ? createClient({ url: config.redisUrl }) : null;
let connected = false;
const INDEX_KEY = "seance:history";

async function ensureConnected() {
  if (redis && !connected) {
    redis.on("error", (e) => console.error("Redis error (history):", e.message));
    await redis.connect();
    connected = true;
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
  if (redis) {
    await ensureConnected();
    await redis.hSet(INDEX_KEY, summary.objectKey, JSON.stringify(summary));
  } else {
    index.set(summary.objectKey, summary);
  }
}

/** Every remembered object, most recently updated first. */
export async function listSessions(): Promise<SessionSummary[]> {
  let all: SessionSummary[];
  if (redis) {
    await ensureConnected();
    const raw = await redis.hGetAll(INDEX_KEY);
    all = Object.values(raw).map((v) => JSON.parse(v) as SessionSummary);
  } else {
    all = [...index.values()];
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Full saved session for revisiting an old chat (persona + portrait + transcript).
 * Delegates to memory.ts — the authoritative store. Returns null if the memory
 * has expired out of the store while the gallery row lingers.
 */
export async function getSession(objectKey: string): Promise<SessionState | null> {
  return loadState(objectKey);
}
