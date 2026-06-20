/**
 * Smoke test for Google Gemini / Imagen 3 image generation.
 * Run: npx tsx scripts/test-gemini.ts
 * Requires GEMINI_API_KEY in .env.local
 */
import { config as dotenvLoad } from "dotenv";
dotenvLoad({ path: ".env.local" });
dotenvLoad();

const apiKey = process.env.GEMINI_API_KEY ?? "";
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY in .env.local");
  process.exit(1);
}

const TEST_PROMPTS = [
  "a grumpy red stapler as an anthropomorphic character portrait, expressive face, dramatic lighting, digital art",
  "a dramatic coffee mug as a wise ancient wizard character portrait, steam rising like magic, fantasy illustration",
  "a pair of headphones as an aloof teenage character portrait, cool attitude, neon colors, character design",
];

async function generate(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image"}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    },
  );
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("No image data in response");
  return `data:${part.inlineData.mimeType ?? "image/png"};base64,${part.inlineData.data.slice(0, 40)}...`;
}

async function main() {
  console.log("Testing Gemini Imagen 3...\n");
  for (const prompt of TEST_PROMPTS) {
    process.stdout.write(`  ${prompt.slice(0, 60)}...\n  → `);
    const start = Date.now();
    try {
      const dataUrl = await generate(prompt);
      console.log(`✓ ${Date.now() - start}ms — ${dataUrl}`);
    } catch (err) {
      console.log(`✗ ${String(err)}`);
    }
  }
}

main().catch(console.error);
