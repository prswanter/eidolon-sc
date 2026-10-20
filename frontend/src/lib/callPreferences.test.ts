import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCallPreferences, saveCallPreferences } from "@/lib/callPreferences";

const KEY = "eidolon.callPreferences";

/** This browser's local storage, in memory. */
function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
  return items;
}

afterEach(() => vi.unstubAllGlobals());

describe("call preferences", () => {
  it("start on the system default microphone, standard quality, voice on, phone texture off", () => {
    storage();

    expect(loadCallPreferences()).toEqual({ micId: "", quality: "standard", muted: false, phoneTexture: false });
  });

  it("remember the microphone chosen and phone texture turned on, keeping the rest", () => {
    storage();
    saveCallPreferences({ quality: "high" });

    saveCallPreferences({ micId: "usb" });
    expect(loadCallPreferences()).toEqual({ micId: "usb", quality: "high", muted: false, phoneTexture: false });

    saveCallPreferences({ phoneTexture: true });
    expect(loadCallPreferences()).toEqual({ micId: "usb", quality: "high", muted: false, phoneTexture: true });
  });

  it("fall back to the defaults for what is stored wrongly, keeping what is right", () => {
    storage({ [KEY]: JSON.stringify({ micId: 3, quality: "ultra", muted: true, phoneTexture: "yes" }) });

    expect(loadCallPreferences()).toEqual({ micId: "", quality: "standard", muted: true, phoneTexture: false });
  });

  it("fall back to the defaults when what is stored cannot be read", () => {
    storage({ [KEY]: "{not json" });

    expect(loadCallPreferences()).toEqual({ micId: "", quality: "standard", muted: false, phoneTexture: false });
  });

  it("take phone texture as off when stored before it existed", () => {
    storage({ [KEY]: JSON.stringify({ micId: "usb", quality: "high", muted: true }) });

    expect(loadCallPreferences()).toEqual({ micId: "usb", quality: "high", muted: true, phoneTexture: false });
  });

  it("go on without being remembered when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });

    expect(saveCallPreferences({ micId: "usb" }).micId).toBe("usb");
  });
});
