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
/** How long the speaker mark stays after the last frame that was actually a voice. */
const TALK_HOLD = 450;
/** A quiet open microphone sits under this. A normal speaking voice is over it. */
const TALK_POWER = 0.02 * 0.02;
/** Steady frames a second. A little over the 25 a real mic produces, and under what the server will carry. */
const SEND_RATE = 30;
/** A short pile may leave at once (a hitch). After that, frames keep going at SEND_RATE instead of waiting out the second. */
const SEND_BURST = 40;

/**
 * One send from a bucket that refills over time. A pile can leave at once, and the next frames are not locked out for the rest of the second.
 */
export function takeSend(tokens: number, elapsedSec: number): { tokens: number; send: boolean } {
  const t = Math.min(SEND_BURST, tokens + Math.max(0, elapsedSec) * SEND_RATE);
  if (t < 1) return { tokens: t, send: false };
  return { tokens: t - 1, send: true };
}

/**
 * When to play the next frame. A frame that arrives before the last one has finished plays straight after it.
 * One that arrives late starts again just ahead of now. A pile from a hitch is dropped once the queue is already a fifth of a second ahead, so the talk does not fall behind and then jump.
 */
export function placeVoice(nextAt: number, now: number, frameSec: number): { at: number; next: number } | null {
  let at = nextAt;
  if (at < now + 0.02) at = now + 0.05;
  else if (at > now + 0.2) return null;
  return { at, next: at + frameSec };
}

/** True when this frame is a person talking, not a microphone left open in a quiet room. */
export function frameHasVoice(samples: Int16Array): boolean {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < samples.length; i += 4) {
    const s = samples[i] / 32768;
    acc += s * s;
    n++;
  }
  return n > 0 && acc / n > TALK_POWER;
}

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
  private worklet = false;
  private readonly speakers = new Map<number, Speaker>();
  /** Samples waiting to fill the next frame. */
  private pending: number[] = [];
  private cursor = 0;
  /** True while the microphone is on and sending. */
  on = false;
  /** When each nearby player last sent a frame that was a voice. */
  private readonly said = new Map<number, number>();
  private ticket = 0;
  /** Sends still allowed before the bucket has to refill. */
  private tokens = SEND_BURST;
  private tokenAt = 0;
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
    // The browser's voice processing is left off. Its echo remover sounds fine for a few seconds, then cuts the voice
    // once it has "learned" the room. A steady "A" is what its noise remover deletes. The game sends the microphone as it is.
    const audio: MediaTrackConstraints & { voiceIsolation?: boolean } = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      voiceIsolation: false,
    };
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
      const track = next.getAudioTracks()[0];
      if (track) {
        try {
          await track.applyConstraints(audio);
        } catch {
          // The stream already opened with these.
        }
      }
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

  /** True for a short while after this player sent a voice, so the mark above their name can stay up between words. */
  speaking(id: number): boolean {
    const at = this.said.get(id);
    return at !== undefined && performance.now() - at < TALK_HOLD;
  }

  /** One frame of somebody's voice, already checked to be near you by the server. */
  hear(from: number, name: string, pcm: string): void {
    const samples = decodePcm(pcm);
    if (!samples) return;
    if (frameHasVoice(samples)) this.said.set(from, performance.now());
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
    const placed = placeVoice(speaker.nextAt, ctx.currentTime, samples.length / RATE);
    if (!placed) {
      src.disconnect();
      return;
    }
    src.onended = () => {
      try {
        src.disconnect();
      } catch {
        // Already disconnected.
      }
    };
    src.start(placed.at);
    speaker.nextAt = placed.next;
  }

  /** Quiet the ones you have muted, and fade whoever is walking away. `hear` is how loud they are, 0..1. */
  step(self: { x: number; y: number; z: number }, others: Iterable<VoiceNear>, muted: ReadonlySet<string>, hear = 1): void {
    const now = performance.now();
    for (const [id, at] of this.said) if (now - at >= TALK_HOLD) this.said.delete(id);
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

  /** Cut rumble below the voice. The browser is not asked to strip noise: that is what opened gaps in a steady voice. */
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
      const pcm = new Int16Array(FRAME);
      for (let i = 0; i < FRAME; i++) {
        const x = Math.max(-1, Math.min(1, frame[i]));
        pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff;
      }
      this.emit(encodePcm(pcm));
    }
  }

  private emit(pcm: string): void {
    const now = performance.now();
    const elapsed = this.tokenAt === 0 ? 0 : (now - this.tokenAt) / 1000;
    this.tokenAt = now;
    const step = takeSend(this.tokens, elapsed);
    this.tokens = step.tokens;
    if (!step.send) return;
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
