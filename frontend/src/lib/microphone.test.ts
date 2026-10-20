import { afterEach, describe, expect, it, vi } from "vitest";
import { MicUnavailable } from "@/lib/callEnd";
import { Microphone, RELEASE_AFTER_MS } from "@/lib/microphone";

/** A microphone's track: it can be turned off, stopped, copied, or end because its device is
 * unplugged. */
class FakeTrack extends EventTarget {
  enabled = true;
  stopped = false;
  constructor(
    readonly deviceId: string,
    private readonly copies: FakeTrack[] = [],
  ) {
    super();
  }
  stop() {
    this.stopped = true;
  }
  clone() {
    const copy = new FakeTrack(this.deviceId, this.copies);
    this.copies.push(copy);
    return copy;
  }
  unplug() {
    this.dispatchEvent(new Event("ended"));
  }
}

/** The browser's devices: `plugged` are there, the first is the system default. */
function devices(plugged: string[], options: { denied?: boolean } = {}) {
  const opened: FakeTrack[] = [];
  /** The copies made of the tracks opened. */
  const copies: FakeTrack[] = [];
  const getUserMedia = async ({ audio }: { audio: { deviceId?: { exact: string } } }) => {
    if (options.denied) throw new DOMException("denied", "NotAllowedError");
    const wanted = audio.deviceId?.exact;
    if (wanted !== undefined && !plugged.includes(wanted))
      throw new DOMException("no such device", "OverconstrainedError");
    if (plugged.length === 0) throw new DOMException("no microphone", "NotFoundError");
    const track = new FakeTrack(wanted ?? plugged[0], copies);
    opened.push(track);
    return { getAudioTracks: () => [track], getTracks: () => [track] };
  };
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  return { opened, plugged, copies };
}

/** Lets the microphone's own promise chains (after an unplug) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Microphone: opening", () => {
  it("opens the chosen microphone", async () => {
    devices(["built-in", "usb"]);

    const mic = await Microphone.open("usb");

    expect(mic.inUse).toEqual({ id: "usb", fellBack: false });
    expect((mic.tracks().local.audio as unknown as FakeTrack).deviceId).toBe("usb");
  });

  it("falls back to the system default when the chosen one is gone, and says so", async () => {
    devices(["built-in"]);

    const mic = await Microphone.open("usb");

    expect(mic.inUse).toEqual({ id: "", fellBack: true });
    expect((mic.tracks().local.audio as unknown as FakeTrack).deviceId).toBe("built-in");
  });

  it("fails as unavailable when it is refused", async () => {
    devices(["built-in"], { denied: true });

    await expect(Microphone.open("")).rejects.toBeInstanceOf(MicUnavailable);
  });
});

describe("Microphone: switching during a call", () => {
  it("sends the new track in place of the old one, then stops the old one", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("");
    const sent: FakeTrack[] = [];
    mic.onTrackChange = async (track) => void sent.push(track as unknown as FakeTrack);

    const inUse = await mic.updateMic("usb");

    expect(inUse).toEqual({ id: "usb", fellBack: false });
    expect(sent.map((t) => t.deviceId)).toEqual(["usb"]);
    expect(mic.tracks().local.audio).toBe(opened[1]);
    expect(opened[0].stopped).toBe(true);
    expect(opened[1].stopped).toBe(false);
  });

  it("keeps the old microphone if the new one cannot be sent", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("");
    mic.onTrackChange = async () => {
      throw new Error("replaceTrack failed");
    };

    await expect(mic.updateMic("usb")).rejects.toBeInstanceOf(MicUnavailable);

    expect(mic.tracks().local.audio).toBe(opened[0]);
    expect(mic.inUse).toEqual({ id: "", fellBack: false });
    expect(opened[0].stopped).toBe(false);
    expect(opened[1].stopped).toBe(true);
  });

  it("goes over to the system default when the one in use is unplugged, and says so", async () => {
    const { opened, plugged } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("usb");
    const sent: string[] = [];
    mic.onTrackChange = async (track) => void sent.push((track as unknown as FakeTrack).deviceId);
    const lost = vi.fn();
    mic.onLost = lost;

    plugged.splice(plugged.indexOf("usb"), 1);
    opened[0].unplug();
    await settle();

    expect(sent).toEqual(["built-in"]);
    expect(mic.inUse).toEqual({ id: "", fellBack: true });
    expect(lost).toHaveBeenCalledExactlyOnceWith({ id: "", fellBack: true });
  });

  it("does not take a track it stopped itself for an unplugged one", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("usb");
    const lost = vi.fn();
    mic.onLost = lost;
    await mic.updateMic("built-in");

    opened[0].unplug();
    await settle();

    expect(lost).not.toHaveBeenCalled();
    expect(mic.inUse).toEqual({ id: "built-in", fellBack: false });
  });

  it("stops listening for an unplug once the call is over", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("usb");
    const lost = vi.fn();
    mic.onLost = lost;
    await mic.disconnect();

    opened[0].unplug();
    await settle();

    expect(lost).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
  });
});

describe("Microphone: switches that overlap", () => {
  it("keeps the new microphone muted when mute is pressed while it is being swapped in", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("");
    let swapped = () => {};
    mic.onTrackChange = () => new Promise<void>((resolve) => (swapped = resolve));

    const switching = mic.updateMic("usb");
    await settle();
    mic.enableMic(false);
    swapped();
    await switching;

    expect(opened[1].enabled).toBe(false);
    expect(mic.isMicEnabled).toBe(false);
  });

  it("runs switches one after another, so the last one asked for is in use", async () => {
    const { opened } = devices(["built-in", "usb", "headset"]);
    const mic = await Microphone.open("");
    const sent: string[] = [];
    mic.onTrackChange = async (track) => {
      await settle();
      sent.push((track as unknown as FakeTrack).deviceId);
    };

    await Promise.all([mic.updateMic("usb"), mic.updateMic("headset")]);

    expect(sent).toEqual(["usb", "headset"]);
    expect(mic.inUse).toEqual({ id: "headset", fellBack: false });
    expect(opened.filter((t) => !t.stopped).map((t) => t.deviceId)).toEqual(["headset"]);
  });

  it("does not fall back over a switch asked for before the unplug", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("usb");
    let swapped = () => {};
    mic.onTrackChange = () => new Promise<void>((resolve) => (swapped = resolve));
    const lost = vi.fn();
    mic.onLost = lost;

    const switching = mic.updateMic("built-in");
    await settle();
    opened[0].unplug();
    swapped();
    await switching;
    await settle();

    expect(mic.inUse).toEqual({ id: "built-in", fellBack: false });
    expect(lost).not.toHaveBeenCalled();
  });

  it("says there is no microphone left when the only one is unplugged", async () => {
    const { opened, plugged } = devices(["usb"]);
    const mic = await Microphone.open("usb");
    const lost = vi.fn();
    mic.onLost = lost;

    plugged.length = 0;
    opened[0].unplug();
    await settle();

    expect(lost).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("does not take up a microphone once the call is over mid-switch", async () => {
    const { opened } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("");
    let swapped = () => {};
    mic.onTrackChange = () => new Promise<void>((resolve) => (swapped = resolve));

    const switching = mic.updateMic("usb");
    await settle();
    await mic.disconnect();
    swapped();

    await expect(switching).rejects.toBeInstanceOf(MicUnavailable);
    expect(opened.every((t) => t.stopped)).toBe(true);
    await expect(mic.updateMic("usb")).rejects.toBeInstanceOf(MicUnavailable);
  });
});

describe("Microphone: once the call is over", () => {
  it("stops its track at once, but is let go only after the hang-up tone has had time to play", async () => {
    const { opened, copies } = devices(["built-in"]);
    const mic = await Microphone.open("");
    vi.useFakeTimers();

    await mic.disconnect();

    // 手机上一放开麦克风，系统就退出通话音频，正在放的挂断音会断掉一下：留一份关着的副本撑着。
    expect(opened[0].stopped).toBe(true);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ deviceId: "built-in", enabled: false, stopped: false });
    vi.advanceTimersByTime(RELEASE_AFTER_MS - 1);
    expect(copies[0].stopped).toBe(false);
    vi.advanceTimersByTime(1);
    expect(copies[0].stopped).toBe(true);
  });

  it("holds the microphone switched to, letting the old one go at once", async () => {
    const { copies } = devices(["built-in", "usb"]);
    const mic = await Microphone.open("");
    mic.onTrackChange = async () => {};
    await mic.updateMic("usb");
    vi.useFakeTimers();

    await mic.disconnect();

    expect(copies.map((t) => [t.deviceId, t.stopped])).toEqual([
      ["built-in", true],
      ["usb", false],
    ]);
    vi.advanceTimersByTime(RELEASE_AFTER_MS);
    expect(copies[1].stopped).toBe(true);
  });
});
