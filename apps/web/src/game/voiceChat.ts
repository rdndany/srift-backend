/**
 * Reads the microphone on the audio thread and hands 2048 samples at a time to the page. A silent graph is never
 * pulled, so the output is a tone far below hearing and the node stays connected to the speakers.
 */
const WORKLET = `class SolriftMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(2048);
    this.n = 0;
  }
  process(inputs, outputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let i = 0;
      while (i < ch.length) {
        const take = Math.min(2048 - this.n, ch.length - i);
        this.buf.set(ch.subarray(i, i + take), this.n);
        this.n += take;
        i += take;
        if (this.n === 2048) {
          this.port.postMessage(this.buf.slice(0));
          this.n = 0;
        }
      }
    }
    const out = outputs[0] && outputs[0][0];
    if (out && out.length) out[0] = 0.00001;
    return true;
  }
}
registerProcessor('solrift-mic', SolriftMic);`;

/** Quiet by this far, so a step across the line does not cut in and out. Full volume when they are beside you. */
const DROP = 46;
/** What is sent: 16 kHz, one channel, 40 ms at a time. Short enough to talk over, small enough for the socket. */
const RATE = 16_000;
const FRAME = 640;

export interface VoiceNear {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  dead?: boolean;
}

interface Speaker {
  name: string;
  gain: GainNode;
  nextAt: number;
}

/**
 * Talk to the players standing near you. The microphone stays off until you turn it on. The sound goes through the
 * game server to whoever is close: a direct call between the two browsers cannot get through most home networks,
 * which is why neither side heard the other.
 */
export class VoiceChat {
  private mic: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private shape: BiquadFilterNode | null = null;
  private node: AudioNode | null = null;
  /** How loud the quiet room is. The gate opens above this, and follows it while nobody is talking. */
  private floor = 0.003;
  /** Frames still sent after the voice stops, so the end of a word is not cut off. */
  private hang = 0;
  private worklet = false;
  private readonly speakers = new Map<number, Speaker>();
  /** Samples waiting to fill the next frame. */
  private pending: number[] = [];
  private cursor = 0;
  /** True while the microphone is on and sending. */
  on = false;
  private ticket = 0;
  /** Frames already handed to the socket in this second, so a fast audio callback cannot get the connection closed. */
  private sentAt = 0;
  private sentN = 0;
  private readonly wake = (): void => {
    const ctx = this.out();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };

  constructor(
    private readonly send: (pcm: string) => void,
    private readonly openAudio: () => AudioContext | null = () => null,
  ) {
    window.addEventListener('pointerdown', this.wake);
    window.addEventListener('keydown', this.wake);
  }

  /** Turn the microphone on or off. `deviceId` picks which one; empty is the browser's usual. A sentence comes back when it will not allow it. */
  async setOn(on: boolean, deviceId = ''): Promise<string | null> {
    const mine = ++this.ticket;
    if (!on) {
      this.stopMic();
      return null;
    }
    if (!navigator.mediaDevices?.getUserMedia) return 'This browser has no microphone.';
    // voiceIsolation is Chrome's stronger cut of the room around the voice. A browser that does not know it ignores it.
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: true } as MediaTrackConstraints;
    if (deviceId) audio.deviceId = { ideal: deviceId };
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio });
      if (mine !== this.ticket) {
        next.getTracks().forEach((t) => t.stop());
        return null;
      }
      this.stopMic();
      const ctx = this.out();
      if (!ctx) {
        next.getTracks().forEach((t) => t.stop());
        return 'This browser has no microphone.';
      }
      if (ctx.state === 'suspended') await ctx.resume();
      if (mine !== this.ticket) {
        next.getTracks().forEach((t) => t.stop());
        return null;
      }
      this.mic = next;
      this.on = true;
      await this.arm(ctx, next);
      return null;
    } catch {
      if (mine !== this.ticket) return null;
      this.stopMic();
      return 'The microphone is blocked.';
    }
  }

  /** One frame of somebody's voice, already checked to be near you by the server. */
  hear(from: number, name: string, pcm: string): void {
    const samples = decodePcm(pcm);
    if (!samples) return;
    const ctx = this.out();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const speaker = this.speaker(ctx, from, name);
    const buffer = ctx.createBuffer(1, samples.length, RATE);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) data[i] = samples[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(speaker.gain);
    const now = ctx.currentTime;
    let at = speaker.nextAt;
    if (at < now + 0.02 || at > now + 0.25) at = now + 0.06;
    if (at < now) at = now;
    src.start(at);
    speaker.nextAt = at + samples.length / RATE;
  }

  /** Quiet the ones you have muted, and fade whoever is walking away. `hear` is how loud they are, 0..1. */
  step(self: { x: number; y: number; z: number }, others: Iterable<VoiceNear>, muted: ReadonlySet<string>, hear = 1): void {
    const loud = Math.max(0, Math.min(1, hear));
    const seen = new Set<number>();
    for (const o of others) {
      seen.add(o.id);
      const speaker = this.speakers.get(o.id);
      if (!speaker) continue;
      speaker.name = o.name;
      if (o.dead) {
        speaker.gain.gain.value = 0;
        continue;
      }
      const d = Math.hypot(o.x - self.x, o.y - self.y, o.z - self.z);
      if (d > DROP) speaker.gain.gain.value = 0;
      else speaker.gain.gain.value = muted.has(o.name.toLowerCase()) ? 0 : Math.max(0, Math.min(1, loud * (1 - d / DROP)));
    }
    for (const id of this.speakers.keys()) if (!seen.has(id)) this.speakers.get(id)!.gain.gain.value = 0;
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.wake);
    window.removeEventListener('keydown', this.wake);
    this.stopMic();
    this.speakers.clear();
  }

  /** The context the rest of the game is already playing through. A private one would stay silent and the browser would stop it. */
  private out(): AudioContext | null {
    return this.openAudio();
  }

  private speaker(ctx: AudioContext, id: number, name: string): Speaker {
    const had = this.speakers.get(id);
    if (had) {
      had.name = name;
      return had;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const speaker = { name, gain, nextAt: 0 };
    this.speakers.set(id, speaker);
    return speaker;
  }

  private async arm(ctx: AudioContext, stream: MediaStream): Promise<void> {
    const src = ctx.createMediaStreamSource(stream);
    this.src = src;
    this.pending = [];
    this.cursor = 0;
    this.floor = 0.003;
    this.hang = 0;
    const from = this.cleaned(ctx, src);
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      if (!this.worklet) {
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        this.worklet = true;
      }
      if (!this.on) return;
      const node = new AudioWorkletNode(ctx, 'solrift-mic', { numberOfInputs: 1, numberOfOutputs: 1 });
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (this.on) this.take(e.data, ctx.sampleRate);
      };
      from.connect(node);
      node.connect(ctx.destination);
      this.node = node;
    } catch {
      try {
        from.disconnect();
      } catch {
        // It was not connected yet.
      }
      if (!this.on) return;
      this.armScript(ctx, from);
    }
  }

  /** Cut rumble below the voice. The browser's own suppressor runs first, on the microphone track. */
  private cleaned(ctx: AudioContext, src: AudioNode): BiquadFilterNode {
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 120;
    high.Q.value = 0.7;
    src.connect(high);
    this.shape = high;
    return high;
  }

  /** Older browsers: the same capture, pulled because the output is not silent and not muted. */
  private armScript(ctx: AudioContext, src: AudioNode): void {
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out[0] = 0.00001;
      if (!this.on) return;
      this.take(e.inputBuffer.getChannelData(0), e.inputBuffer.sampleRate);
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    this.node = proc;
  }

  private take(input: Float32Array, sampleRate: number): void {
    const step = sampleRate / RATE;
    if (!Number.isFinite(step) || step <= 0) return;
    let p = this.cursor;
    const wait = this.pending;
    while (p < input.length) {
      const i = Math.floor(p);
      const f = p - i;
      const a = input[i] ?? 0;
      const b = input[Math.min(input.length - 1, i + 1)] ?? a;
      wait.push(a + (b - a) * f);
      p += step;
    }
    this.cursor = p - input.length;
    while (wait.length >= FRAME) {
      const frame = wait.splice(0, FRAME);
      const mute = this.closed(frame);
      const pcm = new Int16Array(FRAME);
      for (let i = 0; i < FRAME; i++) {
        const x = mute ? 0 : Math.max(-1, Math.min(1, frame[i]));
        pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
      }
      this.emit(encodePcm(pcm));
    }
  }

  /** A frame of room tone, not a voice. Stays open briefly after speech so the last syllable is kept. */
  private closed(frame: number[]): boolean {
    let sum = 0;
    for (let i = 0; i < FRAME; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / FRAME);
    const loud = rms > Math.max(0.014, this.floor * 4);
    if (!loud) this.floor = Math.min(0.012, this.floor * 0.92 + rms * 0.08);
    if (loud) this.hang = 8;
    else if (this.hang > 0) this.hang--;
    return !loud && this.hang === 0;
  }

  private emit(pcm: string): void {
    const now = performance.now();
    if (now - this.sentAt > 1000) {
      this.sentAt = now;
      this.sentN = 0;
    }
    if (this.sentN >= 30) return;
    this.sentN++;
    this.send(pcm);
  }

  private stopMic(): void {
    this.on = false;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.src?.disconnect();
    this.shape?.disconnect();
    this.node?.disconnect();
    this.src = null;
    this.shape = null;
    this.node = null;
    this.pending = [];
    this.floor = 0.003;
    this.hang = 0;
  }
}

function encodePcm(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function decodePcm(d: string): Int16Array | null {
  try {
    const bin = atob(d);
    if (bin.length < 2 || bin.length % 2 !== 0 || bin.length > 4000) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  } catch {
    return null;
  }
}
