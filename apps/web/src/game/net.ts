import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@solrift/shared';

export interface NetState {
  connected: boolean;
  pingMs: number;
  players: number;
  seed: number | null;
  /** Display name of the signed-in account on this connection, or null for guests. */
  user: string | null;
}

/** Optional connection to the game server (Phase 0 smoke test: hello + ping). */
export class NetClient {
  readonly state: NetState = { connected: false, pingMs: 0, players: 0, seed: null, user: null };
  private ws: WebSocket | null = null;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly onChange: () => void,
  ) {}

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    const ws = this.ws;
    ws.onopen = () => {
      this.state.connected = true;
      this.sendMsg({ t: 'hello', v: PROTOCOL_VERSION, name: this.name });
      this.pingTimer = window.setInterval(() => this.sendMsg({ t: 'ping', ts: performance.now() }), 2000);
      this.onChange();
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        this.state.players = msg.players;
        this.state.seed = msg.seed;
        this.state.user = msg.user;
      } else if (msg.t === 'pong') {
        this.state.pingMs = Math.round(performance.now() - msg.ts);
      }
      this.onChange();
    };
    ws.onclose = () => {
      this.state.connected = false;
      window.clearInterval(this.pingTimer);
      this.onChange();
      this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  /** Drop the socket and connect again, e.g. after signing in so the server sees the new session cookie. */
  reconnect(): void {
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
    this.state.connected = false;
    this.state.user = null;
    this.connect();
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), 5000);
  }

  close(): void {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }
  }

  private sendMsg(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
