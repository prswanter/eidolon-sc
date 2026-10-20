import { describe, expect, it } from "vitest";

import {
  connectTone,
  focusOf,
  hangUpTone,
  holdMs,
  INITIAL,
  interactionReducer,
  openerShown,
  openerStarts,
  type Interaction,
  type InteractionAction,
} from "./interaction";

const run = (...actions: InteractionAction[]): Interaction => actions.reduce(interactionReducer, INITIAL);

/** 点「接听」；`opener` 是打来电话的那位的开场白：没有、只有字幕（没有音频地址）、有音频。 */
const answer = (opener: Extract<InteractionAction, { type: "answer" }>["opener"] = "voice"): InteractionAction => ({
  type: "answer",
  opener,
});

const press = (id: string, greeting: Extract<InteractionAction, { type: "press" }>["greeting"] = "voice"): InteractionAction => ({
  type: "press",
  id,
  greeting,
});

describe("interactionReducer: 聚焦和点击偶像", () => {
  it("指针、键盘移到一位偶像上就聚焦她，移开就放下；聚焦本身从不出声", () => {
    const pointed = run({ type: "point", id: "meguru" });
    expect(focusOf(pointed)).toBe("meguru");
    expect(pointed.saying).toBeNull();
    expect(pointed.sound).toBe("hidden");
    expect(focusOf(run({ type: "point", id: "meguru" }, { type: "unpoint", id: "meguru" }))).toBeNull();
  });

  it("从一位移到另一位时，先到的移开不会放下后到的", () => {
    const s = run({ type: "point", id: "meguru" }, { type: "point", id: "kogane" }, { type: "unpoint", id: "meguru" });
    expect(focusOf(s)).toBe("kogane");
  });

  it("推入别的组合时放下聚焦，正在说的那句也收掉", () => {
    const s = run(press("meguru"), { type: "leave" });
    expect(focusOf(s)).toBeNull();
    expect(s.saying).toBeNull();
  });
});

describe("interactionReducer: 招呼要不要出声", () => {
  it("第一次点就聚焦她并出声；真的出了声才出现声音开关（开着），播完记下来", () => {
    const pressed = run(press("meguru"));
    expect(focusOf(pressed)).toBe("meguru");
    expect(pressed.saying).toMatchObject({ id: "meguru", voice: "loading" });
    expect(pressed.sound).toBe("hidden");
    const playing = interactionReducer(pressed, { type: "voice", n: 1, event: "playing" });
    expect(playing.saying?.voice).toBe("playing");
    expect(playing.sound).toBe("on");
    expect(interactionReducer(playing, { type: "voice", n: 1, event: "ended" }).saying?.voice).toBe("ended");
  });

  it("音频加载失败就只剩字幕，也不出现开关", () => {
    const s = run(press("meguru"), { type: "voice", n: 1, event: "failed" });
    expect(s.saying).toMatchObject({ id: "meguru", voice: null });
    expect(s.sound).toBe("hidden");
  });

  it("关掉开关以后点，只显示字幕；再打开，正在显示的那句不从中间出声，之后点的又出声", () => {
    const off = run(
      press("meguru"),
      { type: "voice", n: 1, event: "playing" },
      { type: "voice", n: 1, event: "ended" },
      { type: "sound" },
      press("kogane"),
    );
    expect(off.saying).toMatchObject({ id: "kogane", voice: null });
    expect(off.sound).toBe("off");
    const on = interactionReducer(off, { type: "sound" });
    expect(on.sound).toBe("on");
    expect(on.saying).toMatchObject({ id: "kogane", voice: null });
    expect(interactionReducer(on, press("meguru")).saying).toMatchObject({ id: "meguru", voice: "loading" });
  });

  it("说到一半关掉开关：声音停下，字幕留着", () => {
    const s = run(press("meguru"), { type: "voice", n: 1, event: "playing" }, { type: "sound" });
    expect(s.saying).toMatchObject({ id: "meguru", voice: null });
  });

  it("没有音频（没配素材地址或她没有音色）时只显示字幕", () => {
    expect(run(press("meguru", "subtitle")).saying).toMatchObject({ id: "meguru", voice: null });
  });

  it("没有招呼的偶像点了只聚焦，没有字幕和声音；上一句也停下", () => {
    const s = run(press("meguru"), press("kogane", "none"));
    expect(focusOf(s)).toBe("kogane");
    expect(s.saying).toBeNull();
  });
});

describe("interactionReducer: 同时只播一句", () => {
  it("点另一位时上一句停下，换成她这一句；上一句的音频事件和收尾不影响这一句", () => {
    const s = run(
      press("meguru"),
      press("kogane"),
      { type: "voice", n: 1, event: "failed" },
      { type: "voice", n: 1, event: "ended" },
      { type: "done", n: 1 },
    );
    expect(s.saying).toMatchObject({ id: "kogane", n: 2, voice: "loading" });
  });

  it("指针移到另一位身上时，上一句收掉", () => {
    expect(run(press("meguru"), { type: "point", id: "kogane" }).saying).toBeNull();
  });

  it("她说着的时候指针移开，她仍然是聚焦的那位，直到说完", () => {
    const talking = run({ type: "point", id: "meguru" }, press("meguru"), { type: "unpoint", id: "meguru" });
    expect(focusOf(talking)).toBe("meguru");
    const done = interactionReducer(talking, { type: "done", n: 1 });
    expect(done.saying).toBeNull();
    expect(focusOf(done)).toBeNull();
  });
});

describe("holdMs: 字幕还要留多久", () => {
  it("音频还在加载或在播时等它，播完以后再留一会儿，只有字幕时留得久一些", () => {
    expect(holdMs({ id: "a", n: 1, voice: "loading" })).toBeNull();
    expect(holdMs({ id: "a", n: 1, voice: "playing" })).toBeNull();
    const after = holdMs({ id: "a", n: 1, voice: "ended" })!;
    const textOnly = holdMs({ id: "a", n: 1, voice: null })!;
    expect(after).toBeGreaterThan(0);
    expect(textOnly).toBeGreaterThan(after);
  });
});

describe("interactionReducer: 第 4 幕的接听", () => {
  /** 从 `from` 走到 `actions` 以后，每一步要不要播接通音。 */
  const tones = (from: Interaction, ...actions: InteractionAction[]) => {
    const steps: boolean[] = [];
    actions.reduce((s, a) => {
      const next = interactionReducer(s, a);
      steps.push(connectTone(s, next));
      return next;
    }, from);
    return steps;
  };

  it("滚动经过时只有画面在响：没接听就不出声", () => {
    expect(tones(INITIAL, { type: "point", id: "mano" }, { type: "leave" }, { type: "leave-call" })).toEqual([false, false, false]);
  });

  it("点一下「接听」就接通，播一声接通音（没有铃声）", () => {
    expect(run(answer()).call).toBe("connected");
    expect(tones(INITIAL, answer())).toEqual([true]);
  });

  it("接通音真的响了才出现声音开关；放不出来就不出现", () => {
    const connected = run(answer());
    expect(connected.sound).toBe("hidden");
    expect(interactionReducer(connected, { type: "tone", event: "playing" }).sound).toBe("on");
    expect(interactionReducer(connected, { type: "tone", event: "failed" }).sound).toBe("hidden");
  });

  it("声音开关关着时接听：照样接通，但不播接通音", () => {
    const off = run(press("meguru"), { type: "voice", n: 1, event: "playing" }, { type: "sound" });
    expect(off.sound).toBe("off");
    expect(tones(off, answer())).toEqual([false]);
    expect(interactionReducer(off, answer()).call).toBe("connected");
  });

  it("离开第 4 幕就挂断：回到响铃的样子，不出声；已经接通了再点「接听」不再播", () => {
    const connected = run(answer());
    expect(interactionReducer(connected, { type: "leave-call" }).call).toBe("ringing");
    expect(tones(connected, answer(), { type: "leave-call" })).toEqual([false, false]);
  });

  it("同时只有一种声音：接听时正在说的招呼停下", () => {
    const s = run(press("meguru"), { type: "voice", n: 1, event: "playing" }, answer());
    expect(s.saying).toBeNull();
  });
});

describe("interactionReducer: 第 4 幕的挂断和通话结束", () => {
  /** 从 `from` 走到 `actions` 以后，每一步要不要播挂断音。 */
  const hangUpTones = (from: Interaction, ...actions: InteractionAction[]) => {
    const steps: boolean[] = [];
    actions.reduce((s, a) => {
      const next = interactionReducer(s, a);
      steps.push(hangUpTone(s, next));
      return next;
    }, from);
    return steps;
  };
  const soundOff = run(press("meguru"), { type: "voice", n: 1, event: "playing" }, { type: "sound" });

  it("响铃 → 接通 → 通话结束 → 响铃，之后可以再接一次", () => {
    const steps: Interaction["call"][] = [];
    [answer(), { type: "hang-up" } as const, { type: "ring" } as const, answer()].reduce((s, a) => {
      const next = interactionReducer(s, a);
      steps.push(next.call);
      return next;
    }, INITIAL);
    expect(steps).toEqual(["connected", "ended", "ringing", "connected"]);
  });

  it("挂断键只在接通时有效；接听只在响铃时有效，通话结束时点不了", () => {
    expect(run({ type: "hang-up" })).toBe(INITIAL);
    const ended = run(answer(), { type: "hang-up" });
    expect(interactionReducer(ended, { type: "hang-up" })).toBe(ended);
    expect(interactionReducer(ended, answer())).toBe(ended);
    expect(run({ type: "ring" })).toBe(INITIAL);
    expect(interactionReducer(run(answer()), { type: "ring" }).call).toBe("connected");
  });

  it("挂断时播一声挂断音，开场白停下；声音开关关着时不播", () => {
    const speaking = run(answer(), { type: "tone", event: "ended" }, { type: "opener", n: 1, event: "playing" });
    expect(hangUpTones(speaking, { type: "hang-up" })).toEqual([true]);
    expect(interactionReducer(speaking, { type: "hang-up" }).opener).toBeNull();
    expect(hangUpTones(soundOff, answer(), { type: "hang-up" })).toEqual([false, false]);
  });

  it("离开这一幕：接通、通话结束都直接回到响铃，不播挂断音", () => {
    const connected = run(answer());
    const ended = run(answer(), { type: "hang-up" });
    expect(interactionReducer(ended, { type: "leave-call" }).call).toBe("ringing");
    expect(hangUpTones(connected, { type: "leave-call" })).toEqual([false]);
    expect(hangUpTones(ended, { type: "leave-call" }, { type: "ring" })).toEqual([false, false]);
  });

  it("挂断音和接通音互不相干：挂断不播接通音，接听不播挂断音", () => {
    expect(hangUpTones(INITIAL, answer())).toEqual([false]);
    const connected = run(answer());
    expect(connectTone(connected, interactionReducer(connected, { type: "hang-up" }))).toBe(false);
  });
});

describe("interactionReducer: 第 4 幕的开场白", () => {
  /** 从 `from` 走到 `actions` 以后，每一步要不要开始放开场白（放的是第几通电话的）。 */
  const starts = (from: Interaction, ...actions: InteractionAction[]) => {
    const steps: (number | null)[] = [];
    actions.reduce((s, a) => {
      const next = interactionReducer(s, a);
      steps.push(openerStarts(s, next));
      return next;
    }, from);
    return steps;
  };
  const soundOff = run(press("meguru"), { type: "voice", n: 1, event: "playing" }, { type: "sound" });

  it("接通音响完她才开口：字幕和声音一起出来，真的出了声才出现声音开关", () => {
    const connected = run(answer());
    expect(connected.opener).toMatchObject({ voice: "waiting" });
    expect(openerShown(connected.opener)).toBe(false);
    expect(starts(connected, { type: "tone", event: "playing" }, { type: "tone", event: "ended" })).toEqual([null, connected.opener!.n]);

    const loading = run(answer(), { type: "tone", event: "ended" });
    expect(openerShown(loading.opener)).toBe(false);
    const speaking = interactionReducer(loading, { type: "opener", n: loading.opener!.n, event: "playing" });
    expect(speaking.opener?.voice).toBe("playing");
    expect(openerShown(speaking.opener)).toBe(true);
    expect(speaking.sound).toBe("on");
    const ended = interactionReducer(speaking, { type: "opener", n: loading.opener!.n, event: "ended" });
    expect(ended.opener?.voice).toBe("ended");
    expect(openerShown(ended.opener)).toBe(true);
  });

  it("接通音放不出来，开场白照样接着放", () => {
    const connected = run(answer());
    expect(starts(connected, { type: "tone", event: "failed" })).toEqual([connected.opener!.n]);
  });

  it("声音开关关着时接听：只有字幕，一接通就显示，不出声", () => {
    const s = interactionReducer(soundOff, answer());
    expect(s.opener).toMatchObject({ voice: null });
    expect(openerShown(s.opener)).toBe(true);
    expect(starts(soundOff, answer())).toEqual([null]);
  });

  it("没有音频（没配素材地址或她没有音色）时只有字幕", () => {
    const s = run(answer("subtitle"));
    expect(s.opener).toMatchObject({ voice: null });
    expect(openerShown(s.opener)).toBe(true);
    expect(starts(INITIAL, answer("subtitle"), { type: "tone", event: "ended" })).toEqual([null, null]);
  });

  it("音频放不出来就退成只有字幕，不出现声音开关", () => {
    const s = run(answer(), { type: "tone", event: "failed" }, { type: "opener", n: 1, event: "failed" });
    expect(s.opener).toMatchObject({ voice: null });
    expect(openerShown(s.opener)).toBe(true);
    expect(s.sound).toBe("hidden");
  });

  it("她说到一半关掉声音开关：声音停下，字幕留着", () => {
    const s = run(answer(), { type: "tone", event: "ended" }, { type: "opener", n: 1, event: "playing" }, { type: "sound" });
    expect(s.opener).toMatchObject({ voice: null });
    expect(openerShown(s.opener)).toBe(true);
  });

  it("挂断（离开这一幕）时开场白停下；再接一次是新的一通，上一通的音频事件不落到这一通上", () => {
    const hungUp = run(answer(), { type: "tone", event: "ended" }, { type: "opener", n: 1, event: "playing" }, { type: "leave-call" });
    expect(hungUp.opener).toBeNull();
    const again = run(
      answer(),
      { type: "tone", event: "ended" },
      { type: "leave-call" },
      answer(),
      { type: "opener", n: 1, event: "playing" },
      { type: "opener", n: 1, event: "failed" },
    );
    expect(again.opener).toMatchObject({ n: 2, voice: "waiting" });
  });

  it("打来电话的那位没有开场白：接通后只有立绘和计时，没有字幕也不出声", () => {
    const s = run(answer("none"));
    expect(s.call).toBe("connected");
    expect(s.opener).toBeNull();
    expect(openerShown(s.opener)).toBe(false);
    expect(starts(INITIAL, answer("none"), { type: "tone", event: "ended" })).toEqual([null, null]);
  });
});
