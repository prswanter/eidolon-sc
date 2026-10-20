// Where the navigation shell's rules send the call (.scratch/app-navigation spec「外壳持有的东西」
// 「通话条」, ADR-0018): the conversations, the gifts page and the settings share one shell, and
// the call belongs to it, not to her conversation page. Given a URL and whom the call under way
// is with (or no one), these say whether that URL is in the shell, whether the call bar shows
// across its top, and whether going there keeps the call, asks first and then hangs up, or just
// goes. They also say which item of the rail (desktop) and the dock (phone) is current and where
// clicking one goes (spec「电脑导航栏」「手机 dock」).

/** Going somewhere, with or without a call under way:
 * - `keep`: a page in the shell; the call goes on;
 * - `ask`: another character's conversation, or out of the shell; ask first, hang up if confirmed;
 * - `go`: no call under way; nothing to ask. */
export type Departure = "keep" | "ask" | "go";

/** The path of a URL, and whether it is on this site: the app links within itself by path, so
 * a URL with a host of its own is taken to be another site. */
function pathOf(href: string): { path: string; local: boolean } {
  const url = new URL(href, "http://shell.invalid");
  return { path: url.pathname, local: url.host === "shell.invalid" };
}

/** Whose conversation page this path is, or null if it is not one. */
function conversationOf(path: string): string | null {
  const match = /^\/conversation\/([^/]+)\/?$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

/** The two editors' pages, which the shell holds as it holds the settings. */
export const SHEET_EDITOR = "/sheets";
export const REPLY_FORMAT_EDITOR = "/reply-format";

/** The conversations (list and each character's page), the gifts page, the settings
 * (memories among them) and the two editors (a character's sheet, the reply format) are in
 * the shell; the admin console, `/about`, the privacy policy, the terms, sign-in and
 * consent are out of it, and so is anything on another site. */
export function isInShell(href: string): boolean {
  const { path, local } = pathOf(href);
  if (!local) return false;
  return (
    path === "/conversations" ||
    conversationOf(path) !== null ||
    path === "/gifts" ||
    path === "/settings" ||
    path.startsWith("/settings/") ||
    path === SHEET_EDITOR ||
    path === REPLY_FORMAT_EDITOR
  );
}

/** The call bar across the top of the shell: while a call is under way, on a page in the shell
 * other than her own conversation page, which has its own bar under its header. Whether the
 * call layer is folded away is the caller's to add. */
export function showsShellCallBar(href: string, callee: string | null): boolean {
  if (callee === null || !isInShell(href)) return false;
  return conversationOf(pathOf(href).path) !== callee;
}

/** What going to `href` in this tab does to the call with `callee` (null for no call): one
 * character at a time, so another character's conversation asks, as does leaving the shell.
 * Links that open in a new tab never come here. */
export function departure(href: string, callee: string | null): Departure {
  if (callee === null) return "go";
  if (!isInShell(href)) return "ask";
  const other = conversationOf(pathOf(href).path);
  return other !== null && other !== callee ? "ask" : "keep";
}

/** The items of the rail and the dock, top to bottom (left to right on the dock). The editors
 * come last: they are the deployer's tools, opened now and then, not on the way anywhere. */
export const NAV_ITEMS = ["conversations", "gifts", "settings", "sheets", "reply-format"] as const;
export type NavItem = (typeof NAV_ITEMS)[number];

/** Each item's first level; her conversation page and a settings category below it are its second.
 * The gifts page and the two editors have no second level. */
export const FIRST_LEVEL: Record<NavItem, string> = {
  conversations: "/conversations",
  gifts: "/gifts",
  settings: "/settings",
  sheets: SHEET_EDITOR,
  "reply-format": REPLY_FORMAT_EDITOR,
};

/** The item the URL is under, marked current on the rail and the dock; null out of the shell. */
export function currentNavItem(href: string): NavItem | null {
  const { path } = pathOf(href);
  if (!isInShell(href)) return null;
  if (path === "/gifts") return "gifts";
  if (path === SHEET_EDITOR) return "sheets";
  if (path === REPLY_FORMAT_EDITOR) return "reply-format";
  return path === "/settings" || path.startsWith("/settings/") ? "settings" : "conversations";
}

/** Where clicking `item` from `href` goes: another item goes to its first level, and so does
 * the current one from its second level; the current one on its first level stays (null). */
export function navDestination(item: NavItem, href: string): string | null {
  const to = FIRST_LEVEL[item];
  return currentNavItem(href) === item && pathOf(href).path === to ? null : to;
}

/** What has the focus, as far as telling typing goes (an Element will do). */
export type Focused = { tagName: string; type?: string; isContentEditable?: boolean } | null;

/** Typing on a phone, near enough the keyboard being up, which hides the dock: the focus is in a
 * textarea, an input other than a checkbox, or something editable. */
export function isTyping(focused: Focused): boolean {
  if (!focused) return false;
  if (focused.tagName === "TEXTAREA" || focused.isContentEditable) return true;
  return focused.tagName === "INPUT" && focused.type !== "checkbox";
}
