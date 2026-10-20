// The microphone for a call, handed to the Pipecat transport as its media manager.
//
// The transport's default media manager is built on Daily's SDK, which downloads
// its call bundle from Daily's CDN and reports errors to Sentry; neither is needed
// (or reliably reachable) for a direct WebRTC call, so this one simply wraps a
// getUserMedia stream. It only provides what the transport uses: the local audio
// track and mic on/off; and, for the call, switching to another microphone.

import { MicUnavailable } from "@/lib/callEnd";

/** The microphone a call is using. */
export type MicInUse = {
  /** The device asked for and opened; empty for the system default. */
  id: string;
  /** The device asked for is not there, so the system default is used instead. */
  fellBack: boolean;
};

const PROCESSING = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** How long the microphone is held open, not listening, once the call is over. On phones
 * letting it go takes the system out of call audio, which cuts off for most of a second whatever
 * is playing: here the hang-up tone (GLOSSARY.md「挂断音」; 1.6 s, public/sounds/CREDITS.md),
 * held through to its end. */
export const RELEASE_AFTER_MS = 2000;

export class Microphone {
  /** Sends a new track in place of the one the call is sending; set by the call. */
  onTrackChange: ((track: MediaStreamTrack) => Promise<void>) | null = null;
  /** The microphone in use was unplugged: the call now uses the system default in its place
   * (`fellBack` if a chosen one was lost), or no microphone at all (null) if none opens.
   * Not called when the system default is lost and another one simply takes over. */
  onLost: ((now: MicInUse | null) => void) | null = null;
  private disconnected = false;
  /** Switches run one after another, so the last one asked for is the one in use. */
  private switching: Promise<unknown> = Promise.resolve();
  /** A copy of the track in use, off, that keeps the microphone open once the call is over:
   * the transport stops the track it sends as the connection closes (see RELEASE_AFTER_MS). */
  private hold: MediaStreamTrack | undefined;

  private constructor(
    private stream: MediaStream,
    private used: MicInUse,
  ) {
    this.hold = holdOf(stream);
    this.watch();
  }

  /** Opens the chosen microphone, falling back to the default one if it is gone. */
  static async open(micId: string): Promise<Microphone> {
    const { stream, inUse } = await openStream(micId);
    return new Microphone(stream, inUse);
  }

  /** The microphone in use. */
  get inUse(): MicInUse {
    return this.used;
  }

  /** Switches to another microphone without renegotiating: the call sends the new track in
   * place of the old one, muted if the old one is. Fails with MicUnavailable, keeping the
   * microphone in use, if the new one cannot be opened or sent, or the call is over. */
  updateMic(micId: string): Promise<MicInUse> {
    const switched = this.switching.then(() => this.switchTo(micId));
    this.switching = switched.catch(() => {});
    return switched;
  }

  private async switchTo(micId: string): Promise<MicInUse> {
    if (this.disconnected) throw new MicUnavailable("the call is over");
    const { stream, inUse } = await openStream(micId);
    const track = stream.getAudioTracks()[0];
    const drop = (reason: string) => {
      stream.getTracks().forEach((t) => t.stop());
      return new MicUnavailable(reason);
    };
    if (this.disconnected) throw drop("the call is over");
    // Muted from the start, if the old one is, so nothing goes out that should not.
    if (track) track.enabled = this.isMicEnabled;
    try {
      if (track) await this.onTrackChange?.(track);
    } catch (e) {
      throw drop((e as Error).message);
    }
    if (this.disconnected) throw drop("the call is over");
    // Mute may have been pressed while the track was being swapped: it went to the old one.
    if (track) track.enabled = this.isMicEnabled;
    const old = this.stream;
    const oldHold = this.hold;
    this.unwatch();
    this.stream = stream;
    this.hold = holdOf(stream);
    this.used = inUse;
    this.watch();
    old.getTracks().forEach((t) => t.stop());
    oldHold?.stop();
    return inUse;
  }

  private get track(): MediaStreamTrack | undefined {
    return this.stream.getAudioTracks()[0];
  }

  /** A track ends by itself when its device is unplugged (one stopped here does not fire
   * `ended`): go over to the system default, after any switch already asked for. */
  private readonly onEnded = () => {
    const lost = this.track;
    const chosen = this.used.id !== "";
    const fallback = this.switching.then(async () => {
      // A switch asked for before this went through: the lost track is no longer in use.
      if (this.disconnected || this.track !== lost) return;
      try {
        await this.switchTo("");
      } catch {
        if (!this.disconnected) this.onLost?.(null);
        return;
      }
      if (!chosen) return;
      this.used = { id: "", fellBack: true };
      this.onLost?.(this.used);
    });
    this.switching = fallback;
  };

  private watch(): void {
    this.track?.addEventListener("ended", this.onEnded);
  }

  private unwatch(): void {
    this.track?.removeEventListener("ended", this.onEnded);
  }

  // --- what the transport calls ---

  setClientOptions(): void {}
  get supportsScreenShare(): boolean {
    return false;
  }
  async initialize(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.disconnected = true;
    this.unwatch();
    this.stream.getTracks().forEach((track) => track.stop());
    const hold = this.hold;
    setTimeout(() => hold?.stop(), RELEASE_AFTER_MS);
  }
  tracks() {
    return { local: { audio: this.track } };
  }
  get isMicEnabled(): boolean {
    return this.track?.enabled ?? false;
  }
  enableMic(enable: boolean): void {
    if (this.track) this.track.enabled = enable;
  }
  get isCamEnabled(): boolean {
    return false;
  }
  enableCam(): void {}
  get isSharingScreen(): boolean {
    return false;
  }
  enableScreenShare(): void {}
  async getAllMics(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }
  async getAllCams(): Promise<MediaDeviceInfo[]> {
    return [];
  }
  async getAllSpeakers(): Promise<MediaDeviceInfo[]> {
    return [];
  }
  updateCam(): void {}
  updateSpeaker(): void {}
  get selectedMic(): Record<string, never> {
    return {};
  }
  get selectedCam(): Record<string, never> {
    return {};
  }
  get selectedSpeaker(): Record<string, never> {
    return {};
  }
}

/** A copy of the stream's track, off: it sends nothing, but keeps the microphone open. */
function holdOf(stream: MediaStream): MediaStreamTrack | undefined {
  const hold = stream.getAudioTracks()[0]?.clone();
  if (hold) hold.enabled = false;
  return hold;
}

/** Opens `micId`, or the system default if it is empty or gone. */
async function openStream(micId: string): Promise<{ stream: MediaStream; inUse: MicInUse }> {
  try {
    if (micId) {
      try {
        const audio = { ...PROCESSING, deviceId: { exact: micId } };
        const stream = await navigator.mediaDevices.getUserMedia({ audio });
        return { stream, inUse: { id: micId, fellBack: false } };
      } catch (e) {
        if ((e as DOMException).name !== "OverconstrainedError") throw e;
      }
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: PROCESSING });
    return { stream, inUse: { id: "", fellBack: micId !== "" } };
  } catch (e) {
    throw new MicUnavailable((e as Error).message);
  }
}

/** The microphones this browser has, without Chrome's「default」entry that repeats one of them. */
export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default");
}
