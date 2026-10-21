// 朗读的 seam：fetch、Audio、object URL 都换成假的，不真的出声。测四件事：
// 请求带上这个浏览器为这位用户存的自带语音合成 key（跟通话带的是同一把）、没存就不带、
// 合不成的理由留在状态里给气泡写出来、失败后点一次就重试（不是先收起再点）。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speechState, stopSpeech, toggleSpeech } from "@/lib/messageSpeech";

const MY_FISH = { api_key: "fish-my-own-key-aaaa", model: "drama-3" } as const;

/** This browser's local storage, in memory. */
function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  });
  return items;
}

/** What the fake backend answers: a body, or a failure saying why. */
type Answer = { status?: number; detail?: string };

/** Each request the page made, in order: where, by which method, with what body. */
const requests: { url: string; method: string; body: string }[] = [];

/** Have `fetch` answer the questions in `answers`, in order. */
function serve(...answers: Answer[]) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, method: init.method ?? "GET", body: String(init.body ?? "") });
    const { status = 200, detail } = answers.shift() ?? {};
    return {
      ok: status < 400,
      status,
      json: async () => ({ detail }),
      blob: async () => new Blob(["mp3"]),
    };
  });
}

/** An <audio> that only records what it was told, saying it plays as soon as it is; as a
 * real one does, saying `error` too when its src is cleared. */
class FakeAudio {
  static all: FakeAudio[] = [];
  paused = false;
  private source: string;
  private readonly listeners = new Map<string, (() => void)[]>();

  constructor(src: string) {
    this.source = src;
    FakeAudio.all.push(this);
  }

  get src() {
    return this.source;
  }

  set src(next: string) {
    this.source = next;
    // 真实浏览器清 src 之后会异步发一次 error，正是它会让人以为「没能念出来」。
    if (next === "") queueMicrotask(() => this.emit("error"));
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  play() {
    this.emit("playing");
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  /** 假装放完了。 */
  finish() {
    this.emit("ended");
  }

  private emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

beforeEach(() => {
  requests.length = 0;
  FakeAudio.all = [];
  vi.stubGlobal("Audio", FakeAudio);
  Object.assign(URL, {
    createObjectURL: () => "blob:fake-audio",
    revokeObjectURL: () => {},
  });
});

afterEach(() => {
  stopSpeech();
  vi.unstubAllGlobals();
});

describe("toggleSpeech", () => {
  it("brings the speech key this browser keeps for the user, as a call does", async () => {
    storage({ "eidolon.ownKeys.u1": JSON.stringify({ tts: MY_FISH }) });
    serve({});

    await toggleSpeech(7, "没能念出来", "u1");

    expect(requests).toEqual([
      { url: "/api/messages/7/speech", method: "POST", body: JSON.stringify({ own_keys: { tts: MY_FISH } }) },
    ]);
    expect(speechState()).toMatchObject({ messageId: 7, phase: "playing" });
  });

  it("brings nothing without one, leaving it to the deployer's", async () => {
    storage();
    serve({});

    await toggleSpeech(7, "没能念出来", "u1");

    expect(JSON.parse(requests[0].body)).toEqual({});
  });

  it("says why it could not be voiced", async () => {
    storage();
    serve({ status: 503, detail: "还没有配置语音合成" });

    await toggleSpeech(7, "没能念出来", "u1");

    expect(speechState()).toEqual({ messageId: 7, phase: "failed", reason: "还没有配置语音合成" });
  });

  it("retries on the next click instead of only putting the failure away", async () => {
    storage();
    serve({ status: 503, detail: "还没有配置语音合成" }, {});

    await toggleSpeech(7, "没能念出来", "u1");
    await toggleSpeech(7, "没能念出来", "u1");

    expect(requests).toHaveLength(2);
    expect(speechState()).toMatchObject({ messageId: 7, phase: "playing" });
  });

  it("stops when clicked again while playing", async () => {
    storage();
    serve({});

    await toggleSpeech(7, "没能念出来", "u1");
    await toggleSpeech(7, "没能念出来", "u1");

    expect(requests).toHaveLength(1); // the second click played what was already loaded
    expect(FakeAudio.all[0].paused).toBe(true);
    expect(speechState()).toBeNull();
  });

  it("leaves nothing under the bubble once it has finished playing", async () => {
    storage();
    serve({});

    await toggleSpeech(7, "没能念出来", "u1");
    FakeAudio.all[0].finish();
    await Promise.resolve(); // 清 src 的那次 error 排在这一拍

    expect(speechState()).toBeNull();
  });

  it("leaves nothing under the bubble when stopped mid-way", async () => {
    storage();
    serve({});

    await toggleSpeech(7, "没能念出来", "u1");
    await toggleSpeech(7, "没能念出来", "u1");
    await Promise.resolve();

    expect(speechState()).toBeNull();
  });
});
