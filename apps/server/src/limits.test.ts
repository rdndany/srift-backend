import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { HARD_BUFFER_LIMIT, SOFT_BUFFER_LIMIT, createGameServer, sendWithBackpressure, type ConnectionLimits, type GameServer } from './server';

let server: GameServer | null = null;
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await server?.close();
  server = null;
});

async function start(limits: Partial<ConnectionLimits>, room = {}): Promise<number> {
  server = createGameServer({ seed: 42, limits, room: { naturalSpawning: false, ...room } });
  return server.listen(0);
}

function open(port: number, opts: ConstructorParameters<typeof WebSocket>[2] = {}): Promise<{ ws: WebSocket; closed: Promise<{ code: number; reason: string }> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, opts);
    sockets.push(ws);
    const closed = new Promise<{ code: number; reason: string }>((res) => ws.on('close', (code, reason) => res({ code, reason: reason.toString() })));
    ws.on('open', () => resolve({ ws, closed }));
    ws.on('error', reject);
  });
}

const within = <T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> => Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

describe('connection limits', () => {
  it('caps open sockets per address', async () => {
    const port = await start({ maxConnectionsPerIp: 2 });
    const a = await open(port);
    await open(port);
    const c = await open(port);
    expect(await within(c.closed, 1000)).toMatchObject({ code: 1013 });
    expect(await within(Promise.race([a.closed, new Promise((r) => setTimeout(() => r('open'), 150))]), 1000)).toBe('open');
  });

  it('frees the slot when a socket closes', async () => {
    const port = await start({ maxConnectionsPerIp: 1 });
    const a = await open(port);
    a.ws.close();
    await a.closed;
    const b = await open(port);
    expect(await within(Promise.race([b.closed, new Promise((r) => setTimeout(() => r('open'), 150))]), 1000)).toBe('open');
  });

  it('limits how fast an address may open new sockets', async () => {
    const port = await start({ connectsPerMinutePerIp: 3, maxConnectionsPerIp: 50 });
    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const s = await open(port);
      results.push(await within(Promise.race([s.closed, new Promise((r) => setTimeout(() => r('open'), 120))]), 1000));
    }
    expect(results.filter((r) => r === 'open')).toHaveLength(3);
    expect(results.filter((r) => typeof r === 'object' && (r as { code: number }).code === 1013)).toHaveLength(2);
  });

  it('closes sockets that never join', async () => {
    const port = await start({ joinTimeoutMs: 100 });
    const s = await open(port);
    expect(await within(s.closed, 2000)).toMatchObject({ code: 1008, reason: 'join timeout' });
  });

  it('keeps sockets that did join', async () => {
    const port = await start({ joinTimeoutMs: 100 });
    const s = await open(port);
    s.ws.send(JSON.stringify({ t: 'join', name: 'steady' }));
    expect(await within(Promise.race([s.closed, new Promise((r) => setTimeout(() => r('open'), 400))]), 2000)).toBe('open');
    expect(server!.room.playerCount).toBe(1);
  });

  it('closes sockets that keep sending garbage', async () => {
    const port = await start({ maxInvalidMessages: 5 });
    const s = await open(port);
    for (let i = 0; i < 10; i++) s.ws.send('garbage');
    expect(await within(s.closed, 2000)).toMatchObject({ code: 1008, reason: 'too many invalid messages' });
  });

  it('drops a connection that stops answering pings, freeing its seat', async () => {
    const port = await start({ heartbeatMs: 60 });
    // A client that never answers pings (autoPong off) looks like a crashed browser.
    const s = await open(port, { autoPong: false });
    s.ws.send(JSON.stringify({ t: 'join', name: 'ghost' }));
    await new Promise((r) => setTimeout(r, 40));
    expect(server!.room.playerCount).toBe(1);
    await within(s.closed, 2000);
    await new Promise((r) => setTimeout(r, 50));
    expect(server!.room.playerCount).toBe(0);
  });

  it('keeps a connection that does answer pings', async () => {
    const port = await start({ heartbeatMs: 60 });
    const s = await open(port);
    s.ws.send(JSON.stringify({ t: 'join', name: 'alive' }));
    await new Promise((r) => setTimeout(r, 400));
    expect(server!.room.playerCount).toBe(1);
  });

  it('kicks a misbehaving player over the socket with a reason', async () => {
    const port = await start({}, { kickScore: 10 });
    const s = await open(port);
    const got: string[] = [];
    s.ws.on('message', (d) => got.push(d.toString()));
    s.ws.send(JSON.stringify({ t: 'join', name: 'bad' }));
    await new Promise((r) => setTimeout(r, 100));
    // Valid-looking JSON that fails validation costs strike points after joining.
    for (let i = 0; i < 4; i++) s.ws.send(JSON.stringify({ t: 'input', frames: 'nope' }));
    const closed = await within(s.closed, 2000);
    expect(closed).toMatchObject({ code: 1000 });
    expect(got.some((m) => m.includes('"kicked"'))).toBe(true);
    expect(server!.room.playerCount).toBe(0);
  });

  it('exposes room stats on /health', async () => {
    const port = await start({});
    const body = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as { room: { tickMsAvg: number; players: number } };
    expect(body.room).toMatchObject({ players: 0 });
    expect(typeof body.room.tickMsAvg).toBe('number');
  });
});

describe('back-pressure', () => {
  const fake = (bufferedAmount: number, readyState = 1) => {
    const sent: string[] = [];
    let terminated = false;
    return {
      ws: { readyState, bufferedAmount, send: (d: string) => sent.push(d), terminate: () => (terminated = true) },
      sent,
      get terminated() {
        return terminated;
      },
    };
  };

  it('sends everything to a healthy client', () => {
    const f = fake(0);
    expect(sendWithBackpressure(f.ws, { t: 'snap' })).toBe('sent');
    expect(sendWithBackpressure(f.ws, { t: 'events' })).toBe('sent');
    expect(f.sent).toHaveLength(2);
  });

  it('skips snapshots (only) for a client that is falling behind', () => {
    const f = fake(SOFT_BUFFER_LIMIT + 1);
    expect(sendWithBackpressure(f.ws, { t: 'snap' })).toBe('skipped');
    expect(sendWithBackpressure(f.ws, { t: 'blocks' })).toBe('sent');
    expect(f.sent).toHaveLength(1);
    expect(f.terminated).toBe(false);
  });

  it('drops a client that is hopelessly behind', () => {
    const f = fake(HARD_BUFFER_LIMIT + 1);
    expect(sendWithBackpressure(f.ws, { t: 'blocks' })).toBe('dropped');
    expect(f.terminated).toBe(true);
    expect(f.sent).toHaveLength(0);
  });

  it('does nothing for a closed socket', () => {
    const f = fake(0, 3);
    expect(sendWithBackpressure(f.ws, { t: 'snap' })).toBe('skipped');
    expect(f.sent).toHaveLength(0);
  });
});
