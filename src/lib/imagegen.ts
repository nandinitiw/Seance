import { config } from "../config.js";
import type { Persona } from "../types.js";

// The portrait hop. Returns a URL the app can render directly — either a
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
    case "mock":
    default:
      return stylizedPhoto(capturedDataUrl);
  }
}

/**
 * MOCK: hand the captured photo straight back as the portrait, so the object
 * "comes alive" without any image API. Good enough to demo; swap a provider in
 * later for real generated art.
 */
function stylizedPhoto(capturedDataUrl: string): string {
  return capturedDataUrl;
}

// ── Adobe Firefly Services (booth: Adobe) ────────────────────────────────────
// TODO: implement. Two-step: (1) POST client_id/secret to
// https://ims-na1.adobelogin.com/ims/token/v3 for a bearer token, (2) POST the
// prompt to https://firefly-api.adobe.io/v3/images/generate and read the result
// image URL. Return that URL.
async function paintWithFirefly(persona: Persona): Promise<string> {
  if (!config.fireflyClientId || !config.fireflyClientSecret) {
    throw new Error("ADOBE_FIREFLY_CLIENT_ID / _SECRET not set");
  }
  void persona;
  throw new Error("Firefly provider not implemented yet — see TODO in imagegen.ts");
}

// ── Midjourney via your own proxy (no official API) ──────────────────────────
// TODO: implement. POST { prompt: persona.portraitPrompt } to MIDJOURNEY_PROXY_URL,
// poll/await the resulting image URL, return it.
async function paintWithMidjourney(persona: Persona): Promise<string> {
  if (!config.midjourneyProxyUrl) throw new Error("MIDJOURNEY_PROXY_URL not set");
  void persona;
  throw new Error("Midjourney provider not implemented yet — see TODO in imagegen.ts");
}
