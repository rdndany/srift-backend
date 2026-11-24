import type { VoiceSig } from '@solrift/shared';

/** Hear someone this close; drop the call a little farther, so a step across the line does not reconnect. */
const HEAR = 32;
const DROP = 46;

interface Peer {
  id: number;
  name: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement | null;
  pending: RTCIceCandidateInit[];
}

export interface VoiceNear {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  dead?: boolean;
}

/**
 * Talk to the players standing near you. The microphone stays off until you turn it on. The game server only
 * introduces the two browsers; the sound goes directly between them.
 */
export class VoiceChat {
  private mic: MediaStream | null = null;
  private readonly peers = new Map<number, Peer>();
  /** True while the microphone is on and sending. */
  on = false;

  constructor(
    private readonly me: number,
    private readonly send: (to: number, sig: VoiceSig) => void,
  ) {}

  /** A newer request (the key was let go while the browser was still asking) throws this one away. */
  private ticket = 0;

  /** Turn the microphone on or off. `deviceId` picks which one; empty is the browser's usual. A sentence comes back when it will not allow it. */
  async setOn(on: boolean, deviceId = ''): Promise<string | null> {
    const mine = ++this.ticket;
    if (!on) {
      this.on = false;
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = null;
      for (const p of this.peers.values()) this.useMic(p, null);
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
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = next;
      this.on = true;
      const track = next.getAudioTracks()[0] ?? null;
      for (const p of this.peers.values()) this.useMic(p, track);
      return null;
    } catch {
      if (mine !== this.ticket) return null;
      this.on = false;
      this.mic?.getTracks().forEach((t) => t.stop());
      this.mic = null;
      for (const p of this.peers.values()) this.useMic(p, null);
      return 'The microphone is blocked.';
    }
  }

  /** A setup message from another player. */
  signal(from: number, name: string, sig: VoiceSig): void {
    if (from === this.me) return;
    const peer = this.ensure(from, name);
    void this.take(peer, sig);
  }

  /** Open calls to whoever is close, quiet the ones you have muted, and hang up on whoever walked away. `hear` is how loud they are, 0..1. */
  step(self: { x: number; y: number; z: number }, others: Iterable<VoiceNear>, muted: ReadonlySet<string>, hear = 1): void {
    const keep = new Set<number>();
    const loud = Math.max(0, Math.min(1, hear));
    for (const o of others) {
      if (o.dead || o.id === this.me) continue;
      const d = Math.hypot(o.x - self.x, o.y - self.y, o.z - self.z);
      const peer = this.peers.get(o.id);
      if (d > (peer ? DROP : HEAR)) continue;
      keep.add(o.id);
      const p = peer ?? this.ensure(o.id, o.name);
      if (p.audio) p.audio.volume = muted.has(o.name.toLowerCase()) ? 0 : Math.max(0, Math.min(1, loud * (1 - d / DROP)));
    }
    for (const id of this.peers.keys()) if (!keep.has(id)) this.hangUp(id);
  }

  dispose(): void {
    this.on = false;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    for (const id of [...this.peers.keys()]) this.hangUp(id);
  }

  private ensure(id: number, name: string): Peer {
    const had = this.peers.get(id);
    if (had) {
      had.name = name;
      return had;
    }
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const peer: Peer = { id, name, pc, audio: null, pending: [] };
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const mine = this.mic?.getAudioTracks()[0];
    if (mine) void tr.sender.replaceTrack(mine);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.send(id, { k: 'ice', c: JSON.stringify(e.candidate.toJSON()) });
    };
    pc.ontrack = (e) => {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void el.play().catch(() => undefined);
      peer.audio = el;
    };
    pc.onnegotiationneeded = () => {
      if (this.me < id) void this.offer(peer);
    };
    this.peers.set(id, peer);
    return peer;
  }

  private useMic(peer: Peer, track: MediaStreamTrack | null): void {
    const sender = peer.pc.getSenders().find((s) => !s.track || s.track.kind === 'audio');
    if (sender) void sender.replaceTrack(track);
  }

  private async offer(peer: Peer): Promise<void> {
    if (peer.pc.signalingState !== 'stable') return;
    try {
      const desc = await peer.pc.createOffer();
      if (peer.pc.signalingState !== 'stable') return;
      await peer.pc.setLocalDescription(desc);
      if (desc.sdp) this.send(peer.id, { k: 'offer', sdp: desc.sdp });
    } catch {
      /* the next time someone moves, it tries again */
    }
  }

  private async take(peer: Peer, sig: VoiceSig): Promise<void> {
    try {
      if (sig.k === 'offer') {
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        if (answer.sdp) this.send(peer.id, { k: 'answer', sdp: answer.sdp });
        await this.flush(peer);
      } else if (sig.k === 'answer') {
        if (peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
        await this.flush(peer);
      } else {
        const init = JSON.parse(sig.c) as RTCIceCandidateInit;
        if (!init || typeof init.candidate !== 'string') return;
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(init);
        else peer.pending.push(init);
      }
    } catch {
      /* a repeated or late message is not a reason to drop the call */
    }
  }

  private async flush(peer: Peer): Promise<void> {
    const waiting = peer.pending;
    peer.pending = [];
    for (const c of waiting) {
      try {
        await peer.pc.addIceCandidate(c);
      } catch {
        /* that candidate was no longer useful */
      }
    }
  }

  private hangUp(id: number): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.close();
    if (peer.audio) {
      peer.audio.pause();
      peer.audio.srcObject = null;
    }
  }
}
