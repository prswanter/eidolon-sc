import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LIST_WIDTH,
  LIST_WIDTH_SCRIPT,
  LIST_WIDTH_VARIABLE,
  loadPanelSize,
  savePanelSize,
} from "@/lib/panelSizes";

const KEY = "eidolon.panelSizes";

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

describe("panel sizes", () => {
  it("are unknown until dragged", () => {
    storage();

    expect(loadPanelSize("list")).toBeNull();
    expect(loadPanelSize("composer")).toBeNull();
  });

  it("remember each panel's size in whole pixels, keeping the other", () => {
    storage();
    savePanelSize("list", 380.4);

    savePanelSize("composer", 88);

    expect(loadPanelSize("list")).toBe(380);
    expect(loadPanelSize("composer")).toBe(88);
  });

  it("forget a size stored wrongly", () => {
    storage({ [KEY]: JSON.stringify({ list: "wide", composer: -5 }) });

    expect(loadPanelSize("list")).toBeNull();
    expect(loadPanelSize("composer")).toBeNull();
  });

  it("forget everything when what is stored cannot be read", () => {
    storage({ [KEY]: "{" });

    expect(loadPanelSize("list")).toBeNull();
  });

  it("are not remembered when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("private mode");
      },
    });

    expect(() => savePanelSize("list", 400)).not.toThrow();
    expect(loadPanelSize("list")).toBeNull();
  });
});

describe("list width script", () => {
  /** Runs the inline script against this storage; returns the width it put on <html>, if any. */
  function run(stored: unknown) {
    storage(stored === undefined ? {} : { [KEY]: typeof stored === "string" ? stored : JSON.stringify(stored) });
    const style = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: { style: { setProperty: (name: string, value: string) => void style.set(name, value) } },
    });
    new Function(LIST_WIDTH_SCRIPT)();
    return style.get(LIST_WIDTH_VARIABLE);
  }

  it("puts the width last dragged to on the page", () => {
    expect(run({ list: 400, composer: 88 })).toBe("400px");
  });

  it("keeps the width within what the list drags to", () => {
    expect(run({ list: 100 })).toBe(`${LIST_WIDTH.min}px`);
    expect(run({ list: 900 })).toBe(`${LIST_WIDTH.max}px`);
  });

  it("leaves the initial width when never dragged or stored wrongly", () => {
    expect(run(undefined)).toBeUndefined();
    expect(run({ composer: 88 })).toBeUndefined();
    expect(run({ list: "wide" })).toBeUndefined();
    expect(run("{")).toBeUndefined();
  });
});
