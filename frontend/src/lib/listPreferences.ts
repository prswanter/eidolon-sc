// 对话列表的隐藏和置顶（GLOSSARY.md「隐藏 / 置顶」，spec「隐藏和置顶（前端）」）：只存在这台设备上，
// 在 localStorage 里按用户分开存（键为 eidolon.listPreferences.<用户 ID>），值是「隐藏了谁」「置顶了谁」两组角色 id。
// 不存「显示了谁」，所以新加的角色默认显示。读不到或数据坏了当作什么都没整理；存不进去（隐私模式等）时不抛错，
// 改动只留在页面内存里。

/** 一位用户在这台设备上的整理：隐藏了谁、置顶了谁。同一位不会两边都在。 */
export type ListPreferences = { hidden: string[]; pinned: string[] };

export const NO_PREFERENCES: ListPreferences = { hidden: [], pinned: [] };

function storageKey(userId: string): string {
  return `eidolon.listPreferences.${userId}`;
}

/** 这位用户在这台设备上的隐藏和置顶；`known` 是配置里现有的角色 id，不在里面的忽略。 */
export function listPreferences(userId: string, known: readonly string[]): ListPreferences {
  let stored: unknown;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}");
  } catch {
    return NO_PREFERENCES;
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return NO_PREFERENCES;
  const { hidden, pinned } = stored as Record<string, unknown>;
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && known.includes(id)) : [];
  return { hidden: ids(hidden), pinned: ids(pinned) };
}

/** 存下这位用户的隐藏和置顶；存不进去时什么也不做。 */
export function keepListPreferences(userId: string, prefs: ListPreferences): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    // 存储不可用：这次存不下，改动只在这次页面里生效。
  }
}

/** 隐藏这几位（一位，或者一整个组合），她们的置顶一并取消。 */
export function hide(prefs: ListPreferences, ids: readonly string[]): ListPreferences {
  return { hidden: union(prefs.hidden, ids), pinned: without(prefs.pinned, ids) };
}

/** 让这几位回到列表里。 */
export function show(prefs: ListPreferences, ids: readonly string[]): ListPreferences {
  return { ...prefs, hidden: without(prefs.hidden, ids) };
}

/** 勾选清单和行菜单用：`shown` 为真时显示这几位，否则隐藏。 */
export function setShown(prefs: ListPreferences, ids: readonly string[], shown: boolean): ListPreferences {
  return shown ? show(prefs, ids) : hide(prefs, ids);
}

/** 置顶她，她同时恢复显示。 */
export function pin(prefs: ListPreferences, id: string): ListPreferences {
  return { hidden: without(prefs.hidden, [id]), pinned: union(prefs.pinned, [id]) };
}

export function unpin(prefs: ListPreferences, id: string): ListPreferences {
  return { ...prefs, pinned: without(prefs.pinned, [id]) };
}

/** 「全部显示」：清空隐藏，置顶不动。 */
export function showAll(prefs: ListPreferences): ListPreferences {
  return { ...prefs, hidden: [] };
}

function union(ids: readonly string[], more: readonly string[]): string[] {
  return [...ids, ...more.filter((id, i) => !ids.includes(id) && more.indexOf(id) === i)];
}

function without(ids: readonly string[], gone: readonly string[]): string[] {
  return ids.filter((id) => !gone.includes(id));
}
