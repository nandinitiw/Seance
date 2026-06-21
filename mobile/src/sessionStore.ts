import type { AwakenResponse } from "./api";

/**
 * A tiny module-level handoff for the current séance.
 *
 * The captured photo (and, in mock image mode, the portrait that echoes it) is a
 * 1–4 MB base64 data URL. Passing that through expo-router params serializes it
 * into navigation state on every hop (index → awaken → reveal → conversation),
 * which blocks the JS thread on JSON.stringify/parse and bloats memory. Instead
 * we hold it here by reference and navigate with no params; screens read it back.
 *
 * Resets on a full reload (module re-eval). Screens guard for a null read and
 * offer a "summon another" path rather than trapping the user.
 */
let capturedImage: string | null = null;
let awakenResult: AwakenResponse | null = null;
let challengerResult: AwakenResponse | null = null;

export const sessionStore = {
  setImage(dataUrl: string) {
    capturedImage = dataUrl;
  },
  getImage(): string | null {
    return capturedImage;
  },
  setResult(result: AwakenResponse) {
    awakenResult = result;
  },
  getResult(): AwakenResponse | null {
    return awakenResult;
  },
  setChallenger(result: AwakenResponse) {
    challengerResult = result;
  },
  getChallenger(): AwakenResponse | null {
    return challengerResult;
  },
  clearChallenger() {
    challengerResult = null;
  },
  clear() {
    capturedImage = null;
    awakenResult = null;
    challengerResult = null;
  },
};
