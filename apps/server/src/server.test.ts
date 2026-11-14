import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { NetServerMessage, ServerMessage } from '@solrift/shared';
import { createGameServer, type GameServer } from './server';

let server: GameServer;
let port: number;

beforeAll(async () => {
  server = createGameServer({ seed: 42 });
  port = await server.listen(0);
});

afterAll(async () => {
  await server.close();
});

function connect(): Promise<{ ws: WebSocket; messages: ServerMessage[]; next: () => Promise<ServerMessage> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    const waiters: ((m: ServerMessage) => void)[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      const w = waiters.shift();
      if (w) w(m);
      else messages.push(m);
    });
    const next = () =>
      new Promise<ServerMessage>((res) => {
        const m = messages.shift();
        if (m) res(m);
        else waiters.push(res);
      });
    ws.on('open', () => resolve({ ws, messages, next }));
    ws.on('error', reject);
  });
}

describe('game server', () => {
  it('serves /health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('sends welcome with the world seed and answers pings', async () => {
    const { ws, next } = await connect();
    const welcome = await next();
    expect(welcome).toMatchObject({ t: 'welcome', seed: 42 });
    ws.send(JSON.stringify({ t: 'ping', ts: 123 }));
    expect(await next()).toMatchObject({ t: 'pong', ts: 123 });
    ws.close();
  });

  it('rejects malformed messages without crashing', async () => {
    const { ws, next } = await connect();
    await next(); // welcome
    ws.send('not json');
    expect(await next()).toMatchObject({ t: 'error' });
    ws.send(JSON.stringify({ t: 'ping', ts: 'nope' }));
    expect(await next()).toMatchObject({ t: 'error' });
    ws.close();
  });
});

describe('multiplayer over a socket', () => {
  it('joins a room, streams snapshots and applies inputs', async () => {
    const { ws, messages, next } = await connect();
    await next(); // welcome
    ws.send(JSON.stringify({ t: 'join', name: 'socky' }));
    const joined = (await next()) as unknown as NetServerMessage;
    expect(joined).toMatchObject({ t: 'joined', name: 'socky', seed: 42 });
    ws.send(JSON.stringify({ t: 'input', frames: [{ seq: 1, yaw: 0, pitch: 0, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false }] }));
    // Snapshots arrive on their own, and one of them acknowledges the input.
    let acked = false;
    for (let i = 0; i < 80 && !acked; i++) {
      const m = (await next()) as unknown as NetServerMessage;
      if (m.t === 'snap' && m.ack >= 1) acked = true;
    }
    expect(acked).toBe(true);
    expect(server.room.playerCount).toBe(1);
    expect(messages.length).toBeGreaterThanOrEqual(0);
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.room.playerCount).toBe(0);
  });

  it('ignores game messages before joining and rejects garbage after', async () => {
    const { ws, next } = await connect();
    await next(); // welcome
    ws.send(JSON.stringify({ t: 'input', frames: [{ seq: 1, yaw: 0, pitch: 0, forward: 1, strafe: 0, jump: false, sprint: false, sneak: false, left: false, right: false }] }));
    ws.send(JSON.stringify({ t: 'input', frames: 'nope' }));
    expect(await next()).toMatchObject({ t: 'error' });
    expect(server.room.playerCount).toBe(0);
    ws.close();
  });
});