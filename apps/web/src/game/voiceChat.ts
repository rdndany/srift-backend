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
  private ctx: AudioContext | null = null;
  private proc: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private readonly speakers = new Map<number, Speaker>();
  /** Samples waiting to fill the next frame. */
  private pending: number[] = [];
  private cursor = 0;
  /** True while the microphone is on and sending. */
  on = false;
  private ticket = 0;
  private readonly wake = (): void => {
    void this.out().resume();
  };

  constructor(private readonly send: (pcm: string) => void) {
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
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    if (deviceId) audio.deviceId = { ideal: deviceId };
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio });
      if (mine !== this.ticket) {
        next.getTracks().forEach((t) => t.stop());
        return null;
      }
      this.stopMic();
      this.mic = next;
      this.on = true;
      await this.out().resume();
      this.arm(next);
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
    void ctx.resume();
    const speaker = this.speaker(from, name);
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
    void this.ctx?.close();
    this.ctx = null;
    this.speakers.clear();
  }

  private out(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private speaker(id: number, name: string): Speaker {
    const had = this.speakers.get(id);
    if (had) {
      had.name = name;
      return had;
    }
    const ctx = this.out();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const speaker = { name, gain, nextAt: 0 };
    this.speakers.set(id, speaker);
    return speaker;
  }

  private arm(stream: MediaStream): void {
    const ctx = this.out();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.pending = [];
    this.cursor = 0;
    proc.onaudioprocess = (e) => {
      if (!this.on) return;
      const input = e.inputBuffer.getChannelData(0);
      const step = e.inputBuffer.sampleRate / RATE;
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
        this.send(encodePcm(pcm));
      }
    };
    src.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
    this.proc = proc;
    this.sink = sink;
  }

  private stopMic(): void {
    this.on = false;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.proc?.disconnect();
    this.sink?.disconnect();
    this.proc = null;
    this.sink = null;
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
