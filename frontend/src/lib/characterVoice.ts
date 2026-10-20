// Playing the character's voice in a call, plain or over a phone line (GLOSSARY.md「电话质感」).
//
// Plain, the page's <audio> element plays her track straight, as it always has. With phone
// texture on, her track goes through Web Audio instead: the phone band, a light compressor,
// then a gain that text only turns down to nothing. The element still holds the stream,
// muted: Chrome gives no sound from a remote WebRTC stream that no media element holds.
// Only her voice goes this way; the call tones play on their own.

/** The phone band: roughly what a phone line carries, in Hz. */
const PHONE_BAND = { low: 300, high: 3400 } as const;

/** Builds the phone line after `input`: band limited, lightly compressed. Returns the last node. */
function phoneLine(context: BaseAudioContext, input: AudioNode): AudioNode {
  // Two filters at each edge (24 dB per octave), so the band sounds narrow and not merely dulled.
  const edges: [BiquadFilterType, number][] = [
    ["highpass", PHONE_BAND.low],
    ["highpass", PHONE_BAND.low],
    ["lowpass", PHONE_BAND.high],
    ["lowpass", PHONE_BAND.high],
  ];
  let last = input;
  for (const [type, frequency] of edges) {
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = Math.SQRT1_2;
    last = last.connect(filter);
  }
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.2;
  return last.connect(compressor);
}

export class CharacterVoice {
  private element: HTMLAudioElement | null = null;
  private context: AudioContext | null = null;
  /** Whether this call goes over the phone line; decided when dialing, fixed for the call. */
  private textured = false;
  private textOnly = false;
  /** The phone line her current track plays through, with texture on. */
  private line: { source: AudioNode; volume: GainNode } | null = null;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  /** The page's <audio> element (null once it is gone); usable as its ref. */
  readonly attach = (element: HTMLAudioElement | null) => {
    this.element = element;
    this.applyMuting();
  };

  /** Called while the user dials, inside their click: the audio context may only start from a
   * user gesture, else autoplay rules keep it suspended. */
  dial(phoneTexture: boolean) {
    this.textured = phoneTexture;
    this.disconnectLine();
    if (phoneTexture) {
      this.context ??= this.createContext();
      if (this.context.state === "suspended") void this.context.resume().catch(() => {});
    }
    this.applyMuting();
  }

  /** Her voice has arrived for this call. */
  play(track: MediaStreamTrack) {
    const stream = new MediaStream([track]);
    if (this.element) this.element.srcObject = stream;
    this.disconnectLine();
    if (this.textured && this.context) {
      const source = this.context.createMediaStreamSource(stream);
      const volume = this.context.createGain();
      phoneLine(this.context, source).connect(volume).connect(this.context.destination);
      this.line = { source, volume };
    }
    this.applyMuting();
  }

  /** GLOSSARY.md「只看文字」: her voice is silent, over the phone line or not. */
  setTextOnly(textOnly: boolean) {
    this.textOnly = textOnly;
    this.applyMuting();
  }

  dispose() {
    this.disconnectLine();
    void this.context?.close().catch(() => {});
    this.context = null;
  }

  private applyMuting() {
    if (this.element) this.element.muted = this.textured || this.textOnly;
    if (this.line) this.line.volume.gain.value = this.textOnly ? 0 : 1;
  }

  private disconnectLine() {
    this.line?.source.disconnect();
    this.line = null;
  }
}
