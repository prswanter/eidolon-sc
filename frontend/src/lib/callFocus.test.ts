import { describe, expect, it } from "vitest";
import { focusBack } from "@/lib/callFocus";

describe("focusBack", () => {
  it("puts focus on the call note when the layer collapses while the call goes on", () => {
    expect(focusBack("layer", { layerOpen: false, noteShown: true })).toBe("note");
  });

  it("puts focus on the phone key when the layer collapses as the call ends", () => {
    expect(focusBack("layer", { layerOpen: false, noteShown: false })).toBe("phoneKey");
  });

  it("puts focus on the phone key when the note goes away with focus on it", () => {
    expect(focusBack("note", { layerOpen: false, noteShown: false })).toBe("phoneKey");
  });

  it("leaves focus to the layer when it opens up again", () => {
    expect(focusBack("note", { layerOpen: true, noteShown: false })).toBeNull();
    expect(focusBack("layer", { layerOpen: true, noteShown: false })).toBeNull();
  });

  it("leaves focus alone while it stays where it is", () => {
    expect(focusBack("note", { layerOpen: false, noteShown: true })).toBeNull();
  });

  it("never takes focus from elsewhere on the page", () => {
    expect(focusBack("elsewhere", { layerOpen: false, noteShown: true })).toBeNull();
    expect(focusBack("elsewhere", { layerOpen: false, noteShown: false })).toBeNull();
  });
});
