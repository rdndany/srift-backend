import type { GameSession } from './session';
import { parseSessionMessage, type SessionEvent, type SessionMessage } from './sessionProtocol';

/**
 * The server end of a session connection: takes raw text from a client, validates it, applies it to
 * the session and answers with the events that produced (JSON text). The same object sits behind a
 * WebSocket in multiplayer; in single-player `LoopbackLink` calls it directly.
 */
export class SessionHost {
  /** Messages dropped because they were not valid JSON or failed validation. */
  rejected = 0;

  constructor(readonly session: GameSession) {}

  receive(text: string): string | null {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.rejected++;
      return null;
    }
    const msg = parseSessionMessage(raw);
    if (!msg) {
      this.rejected++;
      return null;
    }
    if (msg.t === 'frame') this.session.tick(msg);
    else this.session.apply(msg);
    const events = this.session.drainEvents();
    return events.length ? JSON.stringify(events) : null;
  }
}

/** Client end of an in-process connection: everything still goes through JSON, like a real socket. */
export class LoopbackLink {
  constructor(
    private readonly host: SessionHost,
    private readonly onEvents: (events: SessionEvent[]) => void,
  ) {}

  send(msg: SessionMessage): void {
    const reply = this.host.receive(JSON.stringify(msg));
    if (reply) this.onEvents(JSON.parse(reply) as SessionEvent[]);
  }

  /** Deliver events the session produced outside a message (debug hooks, loading). */
  flush(): void {
    const events = this.host.session.drainEvents();
    if (events.length) this.onEvents(JSON.parse(JSON.stringify(events)) as SessionEvent[]);
  }
}
