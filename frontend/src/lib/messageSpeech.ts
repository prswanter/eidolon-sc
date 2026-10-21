/**
 * 她的回复按需朗读：点气泡旁的小喇叭才合成，一次只放一条。
 *
 * 语音由后端合成并缓存在这条消息上（`/api/messages/<id>/speech`），再点一次是播放
 * 已存下的那份，不重复花钱。状态放模块里，好让同一条消息的几个气泡共用一个播放器：
 * 换一条就停掉上一条，不叠着响；离开对话页也停（`stopSpeech`）。
 *
 * 合不成就把原因留在状态里，让气泡旁边把它写出来——没有配置语音合成时点下去
 * 什么也不发生，比报错更让人摸不着头脑。
 */

export type SpeechState =
  | { messageId: number; phase: "loading" | "playing" }
  | { messageId: number; phase: "failed"; reason: string }
  | null;

let state: SpeechState = null;
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
const listeners = new Set<() => void>();

function publish(next: SpeechState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function speechState(): SpeechState {
  return state;
}

export function stopSpeech() {
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  if (state !== null) publish(null);
}

/** 放不下去：收起播放器，把原因留在状态里。 */
function fail(messageId: number, reason: string) {
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  publish({ messageId, phase: "failed", reason });
}

/** 后端说不念了的原因（`{"detail": "…"}`），读不出来就用兜底的一句话。 */
async function failureReason(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  } catch {
    // 不是 JSON（网关的错误页之类），用兜底的
  }
  return fallback;
}

/** 播放这条回复的语音；正在放的就是它的，则停下。`failed` 是读不出来时给用户看的一句话。 */
export async function toggleSpeech(messageId: number, failed: string) {
  if (state?.messageId === messageId) {
    stopSpeech();
    return;
  }
  stopSpeech();
  publish({ messageId, phase: "loading" });
  let url: string;
  try {
    const res = await fetch(`/api/messages/${messageId}/speech`, {
      headers: { accept: "audio/mpeg" },
    });
    if (!res.ok) {
      fail(messageId, await failureReason(res, failed));
      return;
    }
    url = URL.createObjectURL(await res.blob());
  } catch {
    fail(messageId, failed);
    return;
  }
  // 合成是异步的：这中间用户可能已经点了别的、或者离开了这一页。
  if (state?.messageId !== messageId) {
    URL.revokeObjectURL(url);
    return;
  }
  objectUrl = url;
  const element = new Audio(url);
  audio = element;
  element.addEventListener("playing", () => publish({ messageId, phase: "playing" }));
  element.addEventListener("ended", stopSpeech);
  element.addEventListener("error", () => fail(messageId, failed));
  void element.play().catch(() => fail(messageId, failed));
}
