import { config } from "../config.js";
import type { Persona } from "../types.js";

// The portrait hop. Returns a URL the browser can render directly — either a
// generated image URL, or a data: URL that re-skins the captured photo (the mock).
//
// SCOPE NOTE: for the demo, a static stylized portrait is plenty. Don't spend
// time on animation — spend it on the persona writing and the voice.

export async function paintPortrait(
  persona: Persona,
  capturedDataUrl: string,
): Promise<string> {
  switch (config.imageProvider) {
    case "firefly":
      return paintWithFirefly(persona).catch((e) => {
        console.warn("Firefly failed, falling back to stylized photo:", e.message);
        return stylizedPhoto(capturedDataUrl);
      });
    case "midjourney":
      return paintWithMidjourney(persona).catch((e) => {
        console.warn("Midjourney proxy failed, falling back to stylized photo:", e.message);
        return stylizedPhoto(capturedDataUrl);
      });
    case "gemini":
      return paintWithGemini(persona).catch((e) => {
        console.warn("Gemini image gen failed, falling back to stylized photo:", e.message);
        return stylizedPhoto(capturedDataUrl);
      });
    case "mock":
    default:
      return stylizedPhoto(capturedDataUrl);
  }
}

/**
 * MOCK: hand the captured photo straight back. The frontend applies a CSS
 * "spirit" treatment (duotone + glow), so the object visibly "comes alive"
 * without any image API. Good enough to demo; swap a provider in later.
 */
function stylizedPhoto(capturedDataUrl: string): string {
  return capturedDataUrl;
}

// ── Adobe Firefly Services (booth: Adobe) ────────────────────────────────────
async function paintWithFirefly(persona: Persona): Promise<string> {
  if (!config.fireflyClientId || !config.fireflyClientSecret) {
    throw new Error("ADOBE_FIREFLY_CLIENT_ID / _SECRET not set");
  }

  // Step 1: client_credentials → bearer token
  const tokenRes = await fetch("https://ims-na1.adobelogin.com/ims/token/v3", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.fireflyClientId,
      client_secret: config.fireflyClientSecret,
      scope: "openid,AdobeID,session,additional_info,read_organizations,firefly_enterprise,firefly_api,creative_sdk",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Firefly auth failed ${tokenRes.status}: ${await tokenRes.text()}`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Step 2: generate the portrait
  const genRes = await fetch("https://firefly-api.adobe.io/v3/images/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "x-api-key": config.fireflyClientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: persona.portraitPrompt,
      numVariations: 1,
      size: { width: 1024, height: 1024 },
      contentClass: "art",
    }),
  });
  if (!genRes.ok) {
    throw new Error(`Firefly generate failed ${genRes.status}: ${await genRes.text()}`);
  }

  const genData = (await genRes.json()) as { outputs?: { image?: { url?: string } }[] };
  const url = genData.outputs?.[0]?.image?.url;
  if (!url) throw new Error("Firefly returned no image URL");
  return url;
}

// ── Google Gemini / Imagen 3 ─────────────────────────────────────────────────
// Uses the Gemini API's image generation endpoint (Imagen 3).
// Free tier: https://aistudio.google.com → Get API key → free quota available.
async function paintWithGemini(persona: Persona): Promise<string> {
  if (!config.geminiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiImageModel}:generateContent?key=${config.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: persona.portraitPrompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini image gen failed ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image data");

  const mime = part.inlineData.mimeType ?? "image/png";
  return `data:${mime};base64,${part.inlineData.data}`;
}

// ── Pollinations.ai mystery portrait (no key, free) ─────────────────────────
// Used only when Claude couldn't identify the object (objectRecognized === false).
const MYSTERY_PROMPT =
  "a whimsical abstract mystery creature, colorful, cartoon style, glowing question marks, playful, no text";

export async function generateMysteryPortrait(fallbackDataUrl: string): Promise<string> {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(MYSTERY_PROMPT)}?width=512&height=512&nologo=true`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    return url;
  } catch (e) {
    console.warn("generateMysteryPortrait: Pollinations unavailable, using raw photo:", (e as Error).message);
    return fallbackDataUrl;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Midjourney via your own proxy (no official API) ──────────────────────────
// TODO: implement. POST { prompt: persona.portraitPrompt } to MIDJOURNEY_PROXY_URL,
// poll/await the resulting image URL, return it.
async function paintWithMidjourney(persona: Persona): Promise<string> {
  if (!config.midjourneyProxyUrl) throw new Error("MIDJOURNEY_PROXY_URL not set");
  void persona;
  throw new Error("Midjourney provider not implemented yet — see TODO in imagegen.ts");
}
