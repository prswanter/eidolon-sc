// How wide the conversation list is and how tall the message input rests on this device's
// wide screen, as the producer last dragged them. Kept in this browser's local storage.

export type Panel = "list" | "composer";

const STORAGE_KEY = "eidolon.panelSizes";

/** The conversation list's width on a wide screen, in pixels: where it starts and how far it drags. */
export const LIST_WIDTH = { initial: 320, min: 240, max: 480 } as const;

/** The CSS variable on <html> holding the list width last dragged to, set before the first paint. */
export const LIST_WIDTH_VARIABLE = "--list-width";

function loadAll(): Partial<Record<Panel, unknown>> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return typeof stored === "object" && stored !== null ? stored : {};
  } catch {
    return {};
  }
}

/** The size last dragged to, in pixels; null when never dragged or stored wrongly. */
export function loadPanelSize(panel: Panel): number | null {
  const size = loadAll()[panel];
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : null;
}

export function savePanelSize(panel: Panel, size: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAll(), [panel]: Math.round(size) }));
  } catch {
    // Storage unavailable (e.g. private mode): the size just won't be remembered.
  }
}

/**
 * Inline script for <head>: runs before the page is first painted and puts the list width last
 * dragged to (kept within LIST_WIDTH) on <html> as LIST_WIDTH_VARIABLE. The server cannot read this
 * browser's storage, so without it the list is first painted at the initial width and then jumps.
 */
export const LIST_WIDTH_SCRIPT = `(function(){try{
var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}"),w=s&&s.list;
if(typeof w==="number"&&isFinite(w)&&w>0)document.documentElement.style.setProperty(${JSON.stringify(LIST_WIDTH_VARIABLE)},Math.min(Math.max(w,${LIST_WIDTH.min}),${LIST_WIDTH.max})+"px");
}catch(e){}})();`;
