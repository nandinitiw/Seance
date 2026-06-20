/**
 * Pre-bake demo objects into Redis so the first scan at demo time is instant.
 * Usage:
 *   npx tsx scripts/prebake.ts <image-path> [<image-path> ...]
 *   npx tsx scripts/prebake.ts photos/stapler.jpg photos/mug.jpg
 *
 * The server must be running: npm run dev
 * Target: http://localhost:3000 (override with SERVER_URL env var)
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const SERVER = process.env.SERVER_URL ?? "http://localhost:3000";
const paths = process.argv.slice(2);

if (paths.length === 0) {
  console.error("Usage: npx tsx scripts/prebake.ts <image.jpg> [<image.jpg> ...]");
  process.exit(1);
}

function toDataUrl(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1);
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const b64 = readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function bake(imagePath: string) {
  process.stdout.write(`Baking ${imagePath}... `);
  const start = Date.now();
  const image = toDataUrl(imagePath);

  const res = await fetch(`${SERVER}/api/awaken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    console.log(`✗ ${data.error}`);
    return;
  }

  const elapsed = Date.now() - start;
  const flag = data.returning ? "↩  returning" : "✨ new";
  console.log(`${flag}  [${elapsed}ms]`);
  console.log(`   key: ${data.persona.objectKey}`);
  console.log(`   name: ${data.persona.name}`);
  console.log(`   tagline: ${data.persona.tagline}`);
  console.log(`   portrait: ${data.portraitUrl.startsWith("data:") ? "(mock/stylized photo)" : data.portraitUrl}`);
  console.log();
}

async function main() {
  console.log(`Pre-baking ${paths.length} object(s) against ${SERVER}\n`);
  // Check server is up
  try {
    const status = await fetch(`${SERVER}/api/status`).then((r) => r.json()) as any;
    console.log(`Server caps: anthropic=${status.anthropic} deepgram=${status.deepgram} redis=${status.redis} image=${status.imageProvider}\n`);
  } catch {
    console.error(`Cannot reach server at ${SERVER}. Run 'npm run dev' first.`);
    process.exit(1);
  }

  for (const p of paths) {
    await bake(p);
  }
}

main().catch(console.error);
