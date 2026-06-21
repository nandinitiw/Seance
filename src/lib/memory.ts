import { createClient } from "redis";
import { config, caps } from "../config.js";
import type { SessionState } from "../types.js";

// The "wow" depth feature: the SAME physical object remembers you across
// sessions. Keyed by persona.objectKey, so pointing the camera at the same red
// stapler tomorrow resumes the relationship.
//
// With no REDIS_URL we transparently fall back to an in-process Map (resets on
// restart) — fine for local dev, swap in the Redis booth's URL for the live demo.

const mem = new Map<string, SessionState>();

const redis = caps.hasRedis ? createClient({ url: config.redisUrl }) : null;

if (redis) {
  redis.on("error", (e) => console.error("Redis error:", e.message));
}

async function ensureConnected() {
  if (redis && !redis.isOpen) {
    await redis.connect();
  }
}

const KEY = (objectKey: string) => `seance:object:${objectKey}`;

export async function loadState(objectKey: string): Promise<SessionState | null> {
  if (redis) {
    await ensureConnected();
    const raw = await redis.get(KEY(objectKey));
    return raw ? (JSON.parse(raw) as SessionState) : null;
  }
  return mem.get(objectKey) ?? null;
}

export async function saveState(state: SessionState): Promise<void> {
  const key = state.persona.objectKey;
  if (redis) {
    await ensureConnected();
    // 7-day TTL so the demo db stays tidy; drop the option to keep forever.
    await redis.set(KEY(key), JSON.stringify(state), { EX: 60 * 60 * 24 * 7 });
  } else {
    mem.set(key, state);
  }
}

/**
 * UPGRADE PATH: swap this hand-rolled history for the Redis Agent Memory Server
 * (https://redis.github.io/agent-memory-server) to get semantic long-term recall
 * — the object could then remember *topics* across many strangers, not just the
 * last transcript. Great "we used Redis for real" story for the judges.
 */
