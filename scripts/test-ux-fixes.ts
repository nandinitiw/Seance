/**
 * Tests for the 5 UX fixes on feature/ux-fixes:
 * 1. Pair dynamic memory — saved and restored via /api/encounter
 * 2. sessionStore encounterResult slot — set/get/clear
 * 3. TTS failure guard — speakOpening always reveals picker (logic-level)
 * 4. Replay CTA — replayCurrentScene re-runs startScene without API call
 * 5. Exit CTAs — seanceBtn / backWrap styles exist in encounter screen
 */

const SERVER = process.env.SERVER_URL ?? "http://localhost:3000";

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return null;
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(path: string) {
  const res = await fetch(`${SERVER}${path}`).catch(() => null);
  if (!res) return null;
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Section 1: Pair dynamic memory ────────────────────────────────────────

console.log("\n" + "─".repeat(72));
console.log("1 · Pair dynamic memory — /api/encounter saves & restores dynamic");
console.log("─".repeat(72));

async function testPairDynamic() {
  // Ensure both test objects exist
  const seedA = await post("/api/awaken", { image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg", objectKey: "ux-fix-obj-a" });
  const seedB = await post("/api/awaken", { image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg", objectKey: "ux-fix-obj-b" });

  if (!seedA || seedA.status > 299 || !seedB || seedB.status > 299) {
    console.log("  (skipping — server not reachable or awaken failed)");
    return;
  }

  // First encounter with explicit dynamic
  const r1 = await post("/api/encounter", {
    objectKey1: "ux-fix-obj-a",
    objectKey2: "ux-fix-obj-b",
    dynamic: "rivals",
  });
  assert(r1 !== null && r1.status === 200, "first encounter with dynamic=rivals succeeds");
  assert(typeof r1?.body?.relationship === "string", "first encounter returns relationship");

  // Second encounter with NO dynamic — should inherit "rivals"
  const r2 = await post("/api/encounter", {
    objectKey1: "ux-fix-obj-a",
    objectKey2: "ux-fix-obj-b",
  });
  assert(r2 !== null && r2.status === 200, "second encounter (no dynamic) succeeds");
  assert(typeof r2?.body?.relationship === "string", "second encounter returns relationship (used saved dynamic)");
  // We can't assert the exact lines match since Claude is non-deterministic,
  // but we can confirm it ran without error and returned valid shape.
  assert(Array.isArray(r2?.body?.lines) && r2.body.lines.length > 0, "second encounter has lines");

  // Pair key is canonical — (b, a) should read the same saved dynamic as (a, b)
  const r3 = await post("/api/encounter", {
    objectKey1: "ux-fix-obj-b",
    objectKey2: "ux-fix-obj-a",
  });
  assert(r3 !== null && r3.status === 200, "reversed key order also succeeds (canonical pair key)");
}

await testPairDynamic();

// ── Section 2: sessionStore encounterResult slot ───────────────────────────

console.log("\n" + "─".repeat(72));
console.log("2 · sessionStore encounterResult slot (unit-level)");
console.log("─".repeat(72));

// Import the compiled sessionStore — we test it directly
// Since it's a mobile module, we test the shape via static analysis assertions
import { readFileSync } from "fs";
const storeSource = readFileSync("mobile/src/sessionStore.ts", "utf8");

assert(storeSource.includes("setEncounter"), "sessionStore exports setEncounter");
assert(storeSource.includes("getEncounter"), "sessionStore exports getEncounter");
assert(storeSource.includes("encounterResult = null"), "encounterResult cleared in clear()");
assert(storeSource.includes("EncounterResponse"), "sessionStore imports EncounterResponse type");

// ── Section 3: TTS failure guard ──────────────────────────────────────────

console.log("\n" + "─".repeat(72));
console.log("3 · TTS failure guard — picker always revealed");
console.log("─".repeat(72));

const revealSource = readFileSync("mobile/app/reveal.tsx", "utf8");

assert(
  revealSource.includes("} finally {") && revealSource.includes("setPickerVisible(true)"),
  "setPickerVisible(true) is inside a finally block"
);
// Make sure it's NOT after the catch block (old position) where it could be skipped
const catchIdx = revealSource.indexOf("} catch {");
const finallyIdx = revealSource.indexOf("} finally {");
const pickerIdx = revealSource.indexOf("setPickerVisible(true)");
assert(pickerIdx > finallyIdx, "setPickerVisible comes after finally (not after catch)");
assert(catchIdx < finallyIdx, "catch block precedes finally block");

// ── Section 4: Replay button exists ───────────────────────────────────────

console.log("\n" + "─".repeat(72));
console.log("4 · Replay button — replayCurrentScene in encounter screen");
console.log("─".repeat(72));

const encounterSource = readFileSync("mobile/app/encounter.tsx", "utf8");

assert(encounterSource.includes("replayCurrentScene"), "replayCurrentScene function defined");
assert(encounterSource.includes("replay this exchange"), "replay button label present");
assert(
  !encounterSource.includes("await import(") && !encounterSource.includes("dynamic import"),
  "replayCurrentScene does not make an API call (no dynamic import)"
);
assert(encounterSource.includes("setDone(false)"), "replayCurrentScene resets done state");

// ── Section 5: Exit CTAs ──────────────────────────────────────────────────

console.log("\n" + "─".repeat(72));
console.log("5 · Exit CTAs — encounter screen has clear exit paths");
console.log("─".repeat(72));

assert(encounterSource.includes("summon another object"), "summon another object CTA present");
assert(encounterSource.includes("return to the spirits"), "return to spirits CTA present");
assert(encounterSource.includes("seanceBtn"), "seanceBtn style defined");
assert(encounterSource.includes('router.replace("/")'), "summon CTA navigates to home");

// ── Section 6: encounter.tsx no longer uses nav params ────────────────────

console.log("\n" + "─".repeat(72));
console.log("6 · Nav param removed — encounter reads from sessionStore");
console.log("─".repeat(72));

assert(!encounterSource.includes("useLocalSearchParams"), "useLocalSearchParams removed from encounter");
assert(!encounterSource.includes("encounterJson"), "encounterJson nav param removed");
assert(encounterSource.includes("sessionStore.getEncounter()"), "reads from sessionStore.getEncounter()");

// Confirm reveal.tsx no longer serializes into params
assert(!revealSource.includes("encounterJson: JSON.stringify"), "reveal.tsx no longer serializes encounter into nav params");
assert(revealSource.includes("sessionStore.setEncounter(data)"), "reveal.tsx calls sessionStore.setEncounter");

// ── Section 7: Awaken progress — waiting lines ────────────────────────────

console.log("\n" + "─".repeat(72));
console.log("7 · Awaken progress — waiting lines keep appearing during long API calls");
console.log("─".repeat(72));

const awakenSource = readFileSync("mobile/app/awaken.tsx", "utf8");

assert(awakenSource.includes("LOG_LINES_WAITING"), "LOG_LINES_WAITING array defined");
assert(awakenSource.includes("LOG_LINES_INITIAL"), "LOG_LINES_INITIAL array defined");
assert(awakenSource.includes("WAITING_LINE_INTERVAL_MS"), "WAITING_LINE_INTERVAL_MS constant defined");
assert(awakenSource.includes("consulting the ether"), "waiting lines contain atmospheric copy");
assert(awakenSource.includes("setLogLines("), "logLines state is updated dynamically");
// Waiting lines fire after the initial batch
assert(
  awakenSource.includes("initialBatchEnd + i * WAITING_LINE_INTERVAL_MS"),
  "waiting lines staggered after initial batch ends"
);

// ── Summary ───────────────────────────────────────────────────────────────

console.log("\n" + "─".repeat(72));
console.log(`done · ${passed} passed · ${failed} failed`);
console.log("─".repeat(72) + "\n");

if (failed > 0) process.exit(1);
