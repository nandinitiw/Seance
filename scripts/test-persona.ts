/**
 * Persona pipeline smoke test.
 *
 *   npm run test:persona            # run against every image in scripts/sample-images
 *   npm run test:persona mug shoe   # only images whose filename contains "mug" or "shoe"
 *
 * For each photo it runs the real awaken() pipeline (vision → Claude → persona)
 * and then one reply() turn so you can read the character's opening line aloud
 * and judge whether it's actually funny. With no ANTHROPIC_API_KEY set it runs
 * the mock path (and says so), so this never hard-fails.
 *
 * Run with tsx (already a devDependency): `npx tsx scripts/test-persona.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
import { caps } from "../src/config.js";
import { awaken, reply } from "../src/lib/claude.js";

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(here, "sample-images");

const MEDIA_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// The line we "speak" to each freshly-awakened object to elicit an opening line.
const OPENER = "Hello? Is someone in there?";

function pickImages(): string[] {
  let files: string[];
  try {
    files = readdirSync(IMAGES_DIR).filter((f) => extname(f).toLowerCase() in MEDIA_TYPES);
  } catch {
    console.error(`No sample-images directory at ${IMAGES_DIR}.`);
    console.error("Drop some object photos there (jpg/png/webp) and re-run.");
    process.exit(1);
  }
  const filters = process.argv.slice(2).map((a) => a.toLowerCase());
  if (filters.length) {
    files = files.filter((f) => filters.some((needle) => f.toLowerCase().includes(needle)));
  }
  return files.sort();
}

function divider(label = "") {
  const line = "─".repeat(72);
  console.log(label ? `\n${line}\n${label}\n${line}` : line);
}

async function run() {
  const images = pickImages();
  if (!images.length) {
    console.error("No matching images found.");
    process.exit(1);
  }

  divider("SÉANCE · persona pipeline test");
  console.log(`Anthropic: ${caps.hasAnthropic ? "LIVE" : "MOCK (set ANTHROPIC_API_KEY for real personas)"}`);
  console.log(`Images:    ${images.length}  (${IMAGES_DIR})`);

  let ok = 0;
  let failed = 0;

  for (const file of images) {
    const label = basename(file, extname(file));
    divider(`📷  ${file}`);

    const mediaType = MEDIA_TYPES[extname(file).toLowerCase()]!;
    const base64 = readFileSync(join(IMAGES_DIR, file)).toString("base64");

    const started = Date.now();
    try {
      const persona = await awaken(base64, mediaType);
      const opening = await reply(persona, [], OPENER, 1);
      const ms = Date.now() - started;

      console.log(`  object       : ${persona.object}`);
      console.log(`  objectKey    : ${persona.objectKey}`);
      console.log(`  name         : ${persona.name}`);
      console.log(`  tagline      : ${persona.tagline}`);
      console.log(`  traits       : ${persona.traits.join(", ")}`);
      console.log(`  voiceModel   : ${persona.voiceModel}`);
      console.log(`  backstory    : ${persona.backstory}`);
      console.log(`  portrait     : ${persona.portraitPrompt}`);
      console.log(`  ── speak it ──────────────────────────────────`);
      console.log(`  you          : ${OPENER}`);
      console.log(`  ${persona.name}: ${opening}`);
      console.log(`  (${ms} ms)`);

      // Surface the fallback persona so a degraded result is obvious, not silent.
      if (persona.objectKey === "unidentified-object") {
        console.log("  ⚠️  fell back to the canned persona (check logs above)");
      }
      ok++;
    } catch (err) {
      // awaken/reply already swallow their own errors, but guard the harness anyway.
      console.error(`  ✖ pipeline threw: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  divider(`done · ${ok} ok · ${failed} failed`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
