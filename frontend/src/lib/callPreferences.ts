// How this device takes calls: microphone, call quality, the mute switch and phone texture.
// Kept in this browser's local storage.

export type Quality = "low" | "standard" | "high";

export const QUALITY_LABELS: Record<Quality, string> = {
  low: "普通",
  standard: "清晰",
  high: "高保真",
};

export type CallPreferences = {
  /** Microphone device id; empty for the system default. */
  micId: string;
  quality: Quality;
  /** Show the character's replies as text only, without playing her voice. */
  muted: boolean;
  /** Make the character's voice sound as if over a phone line (GLOSSARY.md「电话质感」). */
  phoneTexture: boolean;
};

const STORAGE_KEY = "eidolon.callPreferences";
const DEFAULTS: CallPreferences = { micId: "", quality: "standard", muted: false, phoneTexture: false };

export function loadCallPreferences(): CallPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      micId: typeof stored.micId === "string" ? stored.micId : DEFAULTS.micId,
      quality: stored.quality in QUALITY_LABELS ? stored.quality : DEFAULTS.quality,
      muted: typeof stored.muted === "boolean" ? stored.muted : DEFAULTS.muted,
      phoneTexture: typeof stored.phoneTexture === "boolean" ? stored.phoneTexture : DEFAULTS.phoneTexture,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveCallPreferences(change: Partial<CallPreferences>): CallPreferences {
  const next = { ...loadCallPreferences(), ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (e.g. private mode): the preference just won't be remembered.
  }
  return next;
}
