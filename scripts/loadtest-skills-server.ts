// The server of "npm run loadtest -- --skills": the game server as apps/server/src/index.ts starts it, plus a helper that gives every
// player who has joined every skill of their class and keeps their resource full, so that skills can be used from the first second.
import { ABILITIES } from '@solrift/shared';
import { SqliteRepo } from '../apps/server/src/db';
import { createGameServer } from '../apps/server/src/server';

const PORT = Number(process.env.PORT ?? 8790);
const server = createGameServer({
  seed: Number(process.env.WORLD_SEED ?? 1337),
  // (A browser can join too, e.g. scripts/watch-crowd.mjs: AUTH_ORIGINS=<its page address>.)
  origins: process.env.AUTH_ORIGINS ? process.env.AUTH_ORIGINS.split(',').map((s) => s.trim()) : [],
  repo: new SqliteRepo(process.env.DATABASE_PATH ?? ':memory:'),
  room: {
    kind: 'adventure',
    cheats: process.env.CHEATS === '1',
    naturalSpawning: true,
    maxPlayers: process.env.MAX_PLAYERS ? Number(process.env.MAX_PLAYERS) : undefined,
  },
  limits: {
    maxConnectionsPerIp: Number(process.env.MAX_CONN_PER_IP ?? 1000),
    connectsPerMinutePerIp: Number(process.env.CONNECTS_PER_MINUTE ?? 100000),
  },
});
await server.listen(PORT);
setInterval(() => {
  for (const m of server.room.members.values()) {
    const cls = m.player.cls;
    if (!cls) continue;
    for (const a of ABILITIES) if (a.classId === cls.classId) cls.unlocked.add(a.id);
    cls.resource = 1e6;
  }
}, 500);
console.log('ready');
