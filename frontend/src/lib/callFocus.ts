// Where keyboard focus goes when the call layer collapses, or the call note goes away, with
// focus in it (DESIGN.md「Call layer」): never left on something hidden, never taken from
// elsewhere on the page.

/** Where focus was on the conversation page. */
export type FocusSpot = "layer" | "note" | "elsewhere";

/** Where focus goes back to. */
export type FocusTarget = "note" | "phoneKey";

/** What the call screen shows now. */
export type CallScreen = { layerOpen: boolean; noteShown: boolean };

/**
 * Where to put focus now that the call layer is open or not and the call note shown or not;
 * null leaves it where it is. While the call goes on its note stands for it, so focus goes
 * there, one key away from opening the layer again; once the call is over, to the phone key.
 */
export function focusBack(was: FocusSpot, now: CallScreen): FocusTarget | null {
  if (now.layerOpen) return null;
  if (was === "layer") return now.noteShown ? "note" : "phoneKey";
  if (was === "note" && !now.noteShown) return "phoneKey";
  return null;
}
