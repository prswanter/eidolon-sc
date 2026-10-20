import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterVoice } from "@/lib/characterVoice";

/** An audio node in the fake Web Audio graph: what it is, its settings, and where it sends its sound. */
type FakeNode = {
  kind: string;
  outputs: FakeNode[];
  connect: (to: FakeNode) => FakeNode;
  disconnect: () => void;
  type?: string;
  frequency?: { value: number };
  Q?: { value: number };
  gain?: { value: number };
  threshold?: { value: number };
  knee?: { value: number };
  ratio?: { value: number };
  attack?: { value: number };
  release?: { value: number };
  stream?: FakeStream;
};

class FakeStream {
  constructor(readonly tracks: unknown[]) {}
}

function node(kind: string, extra: Partial<FakeNode> = {}): FakeNode {
  const n: FakeNode = {
    kind,
    outputs: [],
    connect: (to) => {
      n.outputs.push(to);
      return to;
    },
    disconnect: () => {
      n.outputs = [];
    },
    ...extra,
  };
  return n;
}

/** The browser's AudioContext, recording the graph built in it. */
function fakeContext(state: "running" | "suspended" = "suspended") {
  const sources: FakeNode[] = [];
  const context = {
    state,
    resumed: 0,
    closed: false,
    destination: node("destination"),
    createMediaStreamSource: (stream: FakeStream) => {
      const source = node("source", { stream });
      sources.push(source);
      return source;
    },
    createBiquadFilter: () => node("filter", { type: "lowpass", frequency: { value: 350 }, Q: { value: 1 } }),
    createDynamicsCompressor: () =>
      node("compressor", {
        threshold: { value: -24 },
        knee: { value: 30 },
        ratio: { value: 12 },
        attack: { value: 0.003 },
        release: { value: 0.25 },
      }),
    createGain: () => node("gain", { gain: { value: 1 } }),
    resume: async () => {
      context.resumed++;
      context.state = "running";
    },
    close: async () => {
      context.closed = true;
    },
  };
  return { context, sources };
}

/** Every chain from a source to the speakers, as the nodes passed through. */
function pathsToSpeakers(from: FakeNode, walked: FakeNode[] = []): FakeNode[][] {
  if (from.kind === "destination") return [walked];
  return from.outputs.flatMap((next) => pathsToSpeakers(next, [...walked, next]));
}

/** Whether a source is heard: some chain reaches the speakers without being turned down to nothing. */
function audible(source: FakeNode) {
  return pathsToSpeakers(source).some((path) => path.every((n) => n.kind !== "gain" || n.gain!.value > 0));
}

function setUp(state?: "running" | "suspended") {
  const fake = fakeContext(state);
  let created = 0;
  const voice = new CharacterVoice(() => {
    created++;
    return fake.context as unknown as AudioContext;
  });
  const element = { srcObject: null as unknown, muted: false };
  voice.attach(element as unknown as HTMLAudioElement);
  return { voice, element, ...fake, contextsCreated: () => created };
}

const track = { kind: "audio" } as unknown as MediaStreamTrack;

beforeEach(() => vi.stubGlobal("MediaStream", FakeStream));
afterEach(() => vi.unstubAllGlobals());

describe("character voice without phone texture", () => {
  it("plays straight from the audio element, as before, without touching Web Audio", () => {
    const { voice, element, contextsCreated } = setUp();

    voice.dial(false);
    voice.play(track);

    expect((element.srcObject as FakeStream).tracks).toEqual([track]);
    expect(element.muted).toBe(false);
    expect(contextsCreated()).toBe(0);
  });

  it("is silenced by text only", () => {
    const { voice, element } = setUp();
    voice.dial(false);
    voice.play(track);

    voice.setTextOnly(true);
    expect(element.muted).toBe(true);

    voice.setTextOnly(false);
    expect(element.muted).toBe(false);
  });
});

describe("character voice with phone texture", () => {
  it("reaches the speakers only through the phone band and a light compressor", () => {
    const { voice, element, sources } = setUp();

    voice.dial(true);
    voice.play(track);

    // The element still holds the stream (Chrome gives no sound from a remote stream otherwise), silently.
    expect((element.srcObject as FakeStream).tracks).toEqual([track]);
    expect(element.muted).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0].stream!.tracks).toEqual([track]);
    const paths = pathsToSpeakers(sources[0]);
    expect(paths).toHaveLength(1);
    const filters = paths[0].filter((n) => n.kind === "filter");
    const lowest = Math.max(...filters.filter((f) => f.type === "highpass").map((f) => f.frequency!.value));
    const highest = Math.min(...filters.filter((f) => f.type === "lowpass").map((f) => f.frequency!.value));
    expect(lowest).toBeGreaterThanOrEqual(250);
    expect(lowest).toBeLessThanOrEqual(350);
    expect(highest).toBeGreaterThanOrEqual(3000);
    expect(highest).toBeLessThanOrEqual(3600);
    const compressors = paths[0].filter((n) => n.kind === "compressor");
    expect(compressors).toHaveLength(1);
    // Light: a gentle ratio, not a limiter.
    expect(compressors[0].ratio!.value).toBeLessThanOrEqual(4);
    expect(audible(sources[0])).toBe(true);
  });

  it("wakes the audio context while dialing, so autoplay rules don't keep it suspended", () => {
    const { voice, context } = setUp("suspended");

    voice.dial(true);

    expect(context.resumed).toBe(1);
  });

  it("is silenced by text only, and heard again when it is turned off", () => {
    const { voice, element, sources } = setUp();
    voice.dial(true);
    voice.play(track);

    voice.setTextOnly(true);
    expect(audible(sources[0])).toBe(false);
    expect(element.muted).toBe(true);

    voice.setTextOnly(false);
    expect(audible(sources[0])).toBe(true);
    expect(element.muted).toBe(true);
  });

  it("starts silenced when text only was already on", () => {
    const { voice, sources } = setUp();
    voice.setTextOnly(true);
    voice.dial(true);

    voice.play(track);

    expect(audible(sources[0])).toBe(false);
  });
});

describe("changing phone texture", () => {
  it("takes effect from the next dial, leaving the last call's graph silent", () => {
    const { voice, element, sources } = setUp();
    voice.dial(true);
    voice.play(track);

    voice.dial(false);
    voice.play(track);

    expect(sources.filter(audible)).toEqual([]);
    expect(element.muted).toBe(false);

    voice.dial(true);
    voice.play(track);

    expect(sources.filter(audible)).toHaveLength(1);
    expect(element.muted).toBe(true);
  });

  it("closes the audio context when the page goes away", () => {
    const { voice, context } = setUp();
    voice.dial(true);

    voice.dispose();

    expect(context.closed).toBe(true);
  });
});
