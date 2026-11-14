# Accounts, saves and multiplayer persistence

Design for Phase 3. It answers three questions: how a player logs in with a Solana wallet (also in
single-player), where progress lives, and how multiplayer and single-player share one save system.

## 1. Principles

1. **The wallet is the identity, not the database.** A wallet proves who you are (one signature at
   login). Progress is stored in our backend, never on-chain. Inventories change many times a second,
   and on-chain storage would be slow, costly and gameable.
2. **Only things worth owning go on-chain.** Cosmetic NFTs, plots and $RIFT (Phase 5). Everything else
   (inventory, position, world edits, stats) is a normal save.
3. **Wallet stays optional.** Guests play with a local save. Logging in adds cloud saves, cross-device
   play, multiplayer identity and purchases.
4. **One save system for both modes.** Single-player and multiplayer use the same `SaveStore`
   interface and the same shared game logic. Only the storage backend and the trust level differ.
5. **Purchased entitlements are never part of a save.** They live in the ledger and are attached to the
   account at load time. Restoring or rolling back a save can never lose or duplicate a purchase.
6. **Single-player worlds are untrusted.** Players can edit their own local worlds. Nothing
   from a single-player save may flow into the economy or online worlds (see 6).

## 2. Login: Sign-In With Solana (SIWS)

```
Browser (Wallet Standard)             API                         DB/Redis
  | GET /auth/nonce -------------------> | nonce (random, 5 min TTL, single use) -> Redis
  | <------------- {nonce, domain, ...}  |
  | wallet.signMessage(SIWS message)     |
  | POST /auth/verify {message, sig} --> | check domain, nonce, issuedAt/expiry,
  |                                      | ed25519 verify(pubkey, message, sig)
  |                                      | upsert account(wallet), create session
  | <-- Set-Cookie: session (httpOnly) --|
```

- **Message** follows the SIWS standard: domain, wallet address, statement, nonce, issued-at,
  expiration. The server rejects a wrong domain (anti-phishing), reused nonces and stale messages.
- **Session:** opaque random id in an `httpOnly; Secure; SameSite=Lax` cookie, stored hashed in the DB,
  sliding 30-day expiry, revocable ("log out everywhere"). The WebSocket reuses the cookie (or a
  one-time ticket from `POST /auth/ws-ticket`), so no long-lived token lives in JavaScript.
- **No signature per action.** Signing happens at login and when authorising a payment (Phase 4).
- **Wallets:** Phantom, Solflare, Backpack via Wallet Standard. Ledger users sign via the off-chain
  message format, so the verifier must accept both plain and off-chain-message encodings.
- **Public identity:** other players see a display name, never the wallet address by default (an
  address exposes a player's holdings). The name is chosen by the player (3 to 16 characters, unique
  ignoring case) and saved with the character look (`accounts.look`, a small integer; see
  `packages/shared/src/look.ts`) through `POST /auth/character`, which needs the session cookie and a
  known origin. The server applies the account's look to the player and sends it to everyone nearby.
- **The character is permanent:** `POST /auth/character` works once per account (`look` is NULL until
  then; a second call is a 409), and there is no edit or rename route. The only change is
  `POST /auth/character/delete` with `{ confirm: <the character name> }`, refused with a 409 while the
  character is in the realm. It deletes everything of the character in one transaction: the realm
  progress (`player:<accountId>` in `room_kv`), every cloud world (chunks and backups cascade), then
  resets the display name to `Player<6 hex>` and `look` to NULL, which frees the name. The web client
  also clears the worlds and recipe book stored on this device (`LocalSaveStore.clearAll`) and then
  offers the character creator again.
- **Entering as a guest, by choice:** the title screen asks "guest or wallet" before the world. A guest
  who picks the character and name keeps them only in that tab (session storage), and the game then
  reads and writes nothing on the device or the server for them. Picking guest while signed in signs
  the session out first.
- **Guests:** a random device id (UUID) in IndexedDB. Guests cannot use cloud saves or servers that
  require accounts.

### Guest to wallet upgrade
On first login on a device that has a local world, the player chooses:
**Upload this world to my account**, **Keep cloud saves only** (local world stays local), or
**Cancel**. Nothing is merged silently.

## 3. What is stored where

| Data | Size | Store | Authority |
|---|---|---|---|
| Account, sessions, display name, settings | tiny | Postgres `accounts`, `sessions` | server |
| Purchases, orders, balances, entitlements | small | Postgres ledger (append-only, double-entry) | server + chain |
| Player progress per world: inventory, hotbar, vitals, position, mode, stats, weather/time (world) | ~2-20 KB | Postgres `player_state` (jsonb + `schema_version`) | server (multiplayer), client (own single-player world) |
| World edits: modified chunks only (unedited terrain is regenerated from the seed) | 1-10 KB per chunk compressed | Region blobs in object storage (S3/R2) indexed in Postgres `world_regions`; local copy in IndexedDB | server / client |
| Block entities (chests, furnaces), mobs near players | small | Inside the region blob / `player_state` | same as above |
| Cosmetic NFTs, plots, $RIFT | on-chain | Solana | chain |

Today's client already stores modified chunks in IndexedDB and the player in `localStorage` (one
key, no version). That is the format we formalise below.

### Save format (shared package, versioned)
```ts
interface PlayerSaveV1 { v: 1; pos; yaw; pitch; mode; selected; inv; vitals; stats; /* ... */ }
interface RegionBlobV1 { v: 1; rx: number; rz: number; chunks: { cx; cz; rle: Uint8Array }[]; blockEntities }
```
- Every save has a `v`. `migrate(save)` upgrades old versions step by step, with tests for every old
  fixture. This is mandatory before the first public save exists.
- Chunks are RLE/deflate compressed. They are grouped into 16x16-chunk regions so a world is hundreds
  of objects, not hundreds of thousands.
- The seed, a content hash and the generator version are recorded. Changing the generator never
  silently alters existing worlds (edited chunks are stored; unedited ones follow `generatorVersion`).
  Today the game has one generator and does not yet keep old ones, so a version bump regenerates the
  unedited chunks. Version 2 (the 256-high world, sea level 63) did exactly that: chunks saved at 128
  blocks high load padded with air above (`decodeChunk`, `LEGACY_CHUNK_BYTES`, and the IndexedDB storage
  migration), but terrain nobody edited changes, so an old world shows a seam at the edge of what its
  player built.

### Characters and classes

- A wallet account holds up to **three characters** (`maxCharacters` 3). Each is a separate save slot: its own name, look, **class**, realm progress (`player:<id>` on the server), cloud worlds and worlds in its own IndexedDB database. Every character is permanent and delete-only (`POST /auth/character/delete`, typed-name confirmation), and a new one is made with `POST /auth/character` (`{ displayName, look, class }`; `class` must be `warrior`, `mage` or `ranger`, otherwise 400). `POST /auth/character/select` switches the one in play.
- The class is chosen when the character is made, stored on the character record (`accounts.class`, a nullable `TEXT` column added by `ALTER TABLE` for existing databases) and never changes. `/auth/me` and the character list return it. The multiplayer server joins a signed-in player with the account's class; a guest sends it in the join message and nothing is stored for guests.
- What is kept of the class goes in the player save as `cls`: `{ v: 1, id, lvl, xp, unlocked: AbilityId[] }` (`unlocked` is the list of abilities the character has learned by reading skill books; a save from before skill books lists none, so such a character learns them again, and the list is filtered to the class's own abilities on load). It holds no balances, prices or wallet data, and it travels wherever the character's progress does (device, cloud, realm database). Cooldowns, resource and temporary defenses are not saved. `parsePlayerSave` keeps `cls` as is and `ClassState.load` validates it (wrong class, junk or hand-edited numbers are ignored or clamped), so a save from before classes loads: classless characters stay classless and a classed character starts at class level 1.
- Class progress is earned on the server (kills and quest rewards) and, like experience, is never taken from a client.

### Worlds on a device, and hardcore
- A local world is named by its **seed** (IndexedDB world id = `String(seed)`, which cloud sync also requires). The title
  screen lists the `players` records, newest first, using `PlayerSave.savedAt` (stamped by `LocalSaveStore.savePlayer`).
- `PlayerSave` has optional `hardcore`, `gameOver` and `spectating`, written only when true and ignored when they make
  no sense (a `gameOver` without `hardcore`). A hardcore death is saved immediately and a loaded game-over world shows the
  dead screen, so reloading, or restoring an older tab, cannot bring the player back. Deleting a world clears all four
  stores for its id; hardcore is not available on game servers.

## 4. Single-player

```
Game UI -> GameSession (shared logic, runs in a Web Worker) -> SaveStore
                                                                 |- IndexedDB   (always, works offline)
                                                                 '- CloudSync   (only when logged in)
```

- The session runs the same simulation the server runs, behind a loopback transport. That keeps
  one code path and makes "open my world to friends" a transport swap.
- **Local first.** IndexedDB is written continuously (as today: every few seconds, plus on blur and
  unload). The game never waits on the network.
- **Cloud sync (logged in):**
  1. **Snapshots, not live writes.** Every ~60 s (and on tab hide, logout and exit via `sendBeacon`),
     upload changed regions plus the player state.
  2. **Delta upload.** A manifest lists `{region, hash, rev}`. Only regions whose hash changed are
     sent.
  3. **Atomic commit.** Blobs go to temporary keys, then one `PUT /worlds/:id/manifest` swaps the
     pointer in a transaction. A crash mid-upload leaves the previous snapshot intact.
  4. **Rolling backups.** Keep the last N snapshots (for example 5 hourly and 3 daily) so players
     can roll back a corrupted or griefed world.
  5. **Optimistic concurrency.** The manifest carries a `revision`. A push with a stale base is
     rejected, and the client offers *keep local*, *keep cloud*, or *keep both as separate worlds*.
  6. **Single writer lease.** A world has a 90 s lease renewed by heartbeat, so two devices cannot edit
     one world at once. The second device opens read-only or takes over explicitly.
- **Export/import:** "Download world" produces a `.solrift` file (zip of the same blobs). It works
  for guests, is a trust-building escape hatch, and gives us a test fixture format.

## 5. Multiplayer

- **Server-authoritative.** The server owns the world, mobs, weather and every inventory operation.
  Clients send intents (`move`, `dig`, `place`, `use`, `click-slot`) and receive snapshots/deltas.
- **Player state keyed by (account, world).** Joining loads `player_state`; leaving and a 30-60 s timer
  save it. Guests on servers that allow them are keyed by device id and clearly marked as non-portable.
- **Item safety.** Moves that create or destroy items (drop, pickup, trade, craft, purchase grant)
  go through server code only. Inventory and the affected world entity are written in **one**
  transaction (or a write-ahead journal that is replayed on crash), so a crash cannot duplicate an
  item that was dropped but not yet saved.
- **World persistence.** Dirty regions are flushed by a write-behind queue every ~30 s and at
  shutdown. Hosted servers use region files on a volume plus periodic upload to object storage.
- **Worlds have a trust class:**
  - `sandbox` (single-player and private servers): anything goes.
  - `official` (shared Hub World, economy): only server-originated items; no imports.

## 6. Cheating and economy boundary

- A single-player save can be edited, so **it can never grant things in an official world** and never
  touches the ledger. Purchased cosmetics work everywhere because they come from account
  entitlements, not from the save.
- Emerald and $RIFT balances exist only in the ledger, not in `player_state`.
- Official worlds validate movement, reach, break speed and inventory ops on the server (Phase 3 v1
  anti-cheat; hardened in Phase 7).
- Cloud saves are size-capped per account (for example 200 MB) with per-account upload rate limits.

## 7. Database sketch

```
accounts(id, wallet UNIQUE, display_name, created_at, last_login_at)
sessions(id_hash PK, account_id, created_at, expires_at, ua_hash)
worlds(id, owner_id, name, seed, kind, generator_version, revision, lease_holder, lease_until)
world_snapshots(id, world_id, revision, manifest jsonb, created_at)
world_regions(world_id, rx, rz, content_hash, blob_key, bytes, revision)
player_state(account_id, world_id, schema_version, data jsonb, updated_at)
ledger_entries(id, account_id, currency, delta, reason, ref UNIQUE, created_at)   -- Phase 4+
entitlements(account_id, item_id, source_ref, granted_at)                          -- Phase 4+
```

Repository interfaces (`AccountRepo`, `WorldRepo`, `PlayerStateRepo`, `BlobStore`) hide the backend:
**SQLite + local disk for development and tests** (no Docker needed on a Windows dev machine),
**Postgres + S3/R2 in production**. The same contract tests run against both.

**Why Postgres and not MongoDB.** MongoDB could store save documents (it has multi-document
transactions), but the part that matters most here is relational: the Phase 4+ ledger, orders and
entitlements need ACID transactions, double-entry rows, and unique constraints so a payment can never
be granted twice (`ledger_entries.ref UNIQUE`). Postgres gives that natively and also covers player
state through `jsonb`. World regions are big blobs and belong in S3/R2 either way, so a document
database buys us little. Because everything sits behind repository interfaces, the choice stays
reversible.

## 8. Security checklist

- SIWS: domain binding, nonce single-use with TTL, expiry, constant-time compare, signature
  verification with a vetted library (`@noble/ed25519` or `tweetnacl`).
- Cookies `httpOnly`, `Secure`, `SameSite`; CSRF token for state-changing API calls; strict CORS to
  our origin.
- Every message and API body validated (zod). Per-IP and per-account rate limits. Save blobs size-
  limited and parsed defensively (a malicious save must not crash or exploit the loader).
- No private keys ever touch our servers for players.
- Minimal personal data: wallet address, display name, IP only in short-lived rate-limit counters.
  Account deletion removes saves and sessions (ledger rows are retained as pseudonymous records).

## 9. Build order (Phase 3)

| Step | Delivers | Needs wallet? |
|---|---|---|
| 3.1 Save format and `SaveStore` | Versioned `PlayerSave`/`RegionBlob`, migrations, IndexedDB store, export/import file | no |
| 3.2 Accounts and SIWS (done) | `/auth/*` endpoints, sessions, wallet connect button, login UI. The guest-to-wallet upload dialog moves to 3.3 | yes |
| 3.3 Cloud saves (done) | SQLite + blob store, delta uploads, revisions, lease, conflict dialogs, backups, guest-to-wallet choice | yes |
| 3.4 `GameSession` refactor (done) | Simulation moves out of `main.ts` into shared code with a loopback transport | no |
| 3.5 Multiplayer (done) | Protocol v1, movement prediction/interpolation, entities, chat, commands, room persistence | yes (or guest) |
| 3.6 Hardening (done) | Anti-cheat v1, load test, crash/dupe tests, connection limits | |

Steps 3.1-3.3 gave players login and durable progress first; 3.4 (done) was the large refactor and 3.5 builds the server on it.
Each step ends with unit tests and an E2E scenario (mock wallet for login, reload and cross-device
cases for sync).

### 3.3 as built

API (all under `/cloud/worlds`, session cookie required, writes need an allowed `Origin` and JSON):

| Route | Purpose |
|---|---|
| `GET /` and `GET /:id` | List worlds / one world's revision, size, lease state |
| `GET /:id/file` | The whole world as a `.solrift` file (header `x-sc-revision`) |
| `PUT /:id` | Push: `{holder, base, seed, chunks[], player?, world?, force?, takeover?, replace?}` |
| `POST /:id/lease`, `/release` | Renew or take the 90 s write lease, give it back |
| `GET /:id/backups`, `POST /:id/restore` | List backups, make one current (the replaced state is backed up first) |
| `DELETE /:id` | Delete the cloud copy and its backups |

Rules the server enforces:
- **Optimistic concurrency.** A push whose `base` is not the current revision gets 409 with the current revision, unless `force` is set (the player chose "keep this device"). A push for a deleted world is also a 409, never a silent re-create.
- **One writer.** A different holder with an unexpired lease gets 423 unless `takeover` is set. The holder id is per browser tab and survives reloads.
- **Atomic.** A push is one transaction (chunks, player, world state, revision, lease). Quota is checked after the writes, inside the transaction, so a failing push leaves nothing behind. Clients split big uploads into several pushes of at most 400 chunks / 3 MB; each is a valid world state.
- **Validated like a hostile file.** Every chunk must decode, player and world records go through the same parsers as local saves (newer game versions are refused), JSON sizes and coordinates are capped, duplicates are rejected.
- **Backups.** Automatic at most hourly, and always before a forced or replacing push and before a restore. The newest 6 per world are kept (the design's "hourly plus daily" tiers are a later refinement).
- **Limits.** 200 MB live data per account, 20 worlds, 30 writes per minute per account.
- **Isolation.** Every query is scoped by the account id from the session; tests cover cross-account reads, writes and deletes.

Client (`apps/web/src/cloud/sync.ts`, `CloudPanel`): IndexedDB v3 adds a `sync` record per world (account, on/off, last revision, a sequence-numbered dirty set that is updated in the same transaction as each chunk write). Uploads run every 60 s, when the tab is hidden, and from "Sync now"; the lease is returned on sign-out and page hide. On sign-in the choice is: upload this world, use the cloud world, or not now. A device with no local world and an existing cloud world just downloads it. Nothing is merged: conflicts, a deleted cloud copy and a locked world each show a dialog, and "Download this device's copy first" exports a `.solrift` file.

Simplifications: one cloud world per seed (the world id is the seed), so "keep both as separate worlds" is the export file for now.
### 3.4 as built

The game is now two halves that only talk through plain data:

- **`GameSession`** (`packages/shared/src/session.ts`): physics, vitals, inventory and menus, mining and building, mobs, drops, explosions, weather, the day clock, death and respawn, and save/load. It has no DOM, audio or rendering, and takes an injectable random source, so it runs in unit tests (on `HeadlessWorld`) and, in 3.5, on the server. `WorldAccess` is what it needs from a world; the browser's streaming `World` and `HeadlessWorld` both implement it. Pure helpers moved with it: `daylightAt` (shared with the sky renderer), `growPlants`, `DropWorld` and `BlockEntities`.
- **The web client** (`apps/web/src/game/main.ts`): renderer, audio, particles, HUD and input. Each animation frame it sends one `InputFrame` (look angles, movement keys, the two mouse buttons, `dt`) and, for discrete actions, a `Command` (select, scroll, mode, fly, home, inventory, close menu, drop, click, shift-click, respawn). The session answers with `SessionEvent`s (sound, particles, toast, hurt, thunder, inventory changed, died, ...) which the client turns into audio and effects.

Protocol (`sessionProtocol.ts`, `sessionLink.ts`): every message is JSON-safe. `SessionHost` takes text, parses and validates it with `parseSessionMessage` (types checked, NaN and infinities rejected, numbers clamped, slots must be small integers, unknown types dropped) and counts what it rejects. `LoopbackLink` is the in-process connection: it still serialises to JSON both ways, so single-player exercises the same path as a socket will.

Test hooks (`window.__solrift`) call session methods directly and flush the events they cause. They are a dev back door, not part of the protocol.

Known limits, left for 3.5:
- The client reads live session objects (`body`, `mobs`, `drops`, `weather`, `target`) to draw the world. A networked client will get the same view from snapshots.
- A frame carries the client's `dt`, which is clamped to 0.1 s but not rate-limited; the authoritative server will use its own tick instead.
- Block changes are not events yet; the browser world is edited in place. 3.5 adds block-change messages.
- Single-player trusts the local session completely (as before); only the server session is a trust boundary.

### 3.5 as built

- **`Realm` and `Player`** (`packages/shared`): the old `GameSession` split in two. A `Realm` is the shared world (terrain, block entities, mobs and spawner, weather, drops, the clock); a `Player` is one person (body, inventory, vitals, menus, mining). `GameSession` is now a `Player` that owns its own `Realm`, so single-player is unchanged. Mobs target the nearest living player, drops go to the nearest collector, explosions hurt everyone in range.
- **`GameRoom`** (`apps/server/src/room.ts`): one `Realm` for all connected players, ticking at 20 Hz. Per tick, every player's queued inputs run (one 1/60 s physics step each), then the shared simulation, then block-change batches and a snapshot per player (players within 160 blocks, mobs and arrows within 96, drops within 64; the inventory only when it changed). Default capacity is 120 players.
- **Protocol** (`netProtocol.ts`): client to server `join`, `input` (at most 8 frames, each with a sequence number), `cmd` (the same commands as single-player: click, select, drop, ...), `chat`, `leave`; server to client `joined`, `edits` (the world's changes relative to the generated terrain, so late joiners need only the seed plus these), `blocks`, `snap`, `events`, `chat`, `notice`, `kicked`. Every field is validated and clamped on the server.
- **Prediction** (`apps/web/src/game/remote.ts`): the client runs each input locally with the same `stepPlayer` and sends it; on a snapshot it takes the server's body and replays the inputs the server has not yet acknowledged. Other players, mobs and drops are smoothed between snapshots. Block changes and menu results show after the server round trip (no block prediction in v1).
- **Authority against speed hacks**: each player has a time budget that refills at real time (capped at 0.25 s); an input costs 1/60 s, so a client cannot move faster than real time however many frames it sends. Creative mode, `/time`, `/weather`, `/gamemode` and `/tp` need the server's `CHEATS=1`.
- **Persistence**: with a repo the room stores its edited chunks (compressed), the clock, weather and chests, and the progress of **signed-in** players (inventory, worn armor, position, vitals, experience level), saved every 30 s, when a player leaves and when the server stops. Guests are not stored (a name is not an identity) and an account can play only once at a time (no duplicated items).
- **Playing**: add `?online` to the URL (or use the "Play online" link); `?server=ws://host:port` picks another server. The server reads `PORT`, `WORLD_SEED`, `DATABASE_PATH`, `CHEATS`, `NO_MOBS`, `MAX_PLAYERS` and `GAME_MODE`. T opens chat, `/` a command.

Known limits, left for 3.6 and later: no block prediction; no per-IP connection cap; no load test yet; one room per server; the web client has no reconnect.
### 3.6 as built

- **What needs no detector.** The server simulates every input itself, so speed, reach, mining speed, flying and walking through walls are already decided by server rules. 3.6 adds tests that prove it (a bare hand cannot mine stone in half a second, creative players cannot break blocks beyond `REACH`, survival players cannot fly, a sprinting player stops at a wall, commands only touch your own inventory).
- **Suspicion score** (`GameRoom.strike`, `STRIKES` in `room.ts`): misbehaviour adds points, the score decays by 1 per second, a warning notice goes out at half the limit and the player is kicked (`kicked` message, socket closed) at `kickScore` (default 50). Costs: invalid message 5, forbidden command or creative switch without cheats 3, chat over the rate limit 2, stale or replayed input sequence 1, command over the rate limit 0.5, each input dropped because the queue is full 0.1. An honest client never earns a point (tested over 400 ticks of play).
- **Command rate limit:** a token bucket of 60 commands refilled at 40 per second per player, so inventory clicks cannot be flooded. Chat keeps its 5 messages per 2 s.
- **Connection limits** (`ConnectionLimits` in `server.ts`, env `MAX_CONN_PER_IP`, `CONNECTS_PER_MINUTE`): at most 10 open sockets and 60 new sockets per minute per address (the address comes from `X-Forwarded-For` when `TRUST_PROXY=1`), a socket must join within 15 s, 20 invalid messages close the socket, and a 15 s ping/pong heartbeat drops dead connections (so a crashed browser frees its account's single seat instead of locking the player out).
- **Back-pressure** (`sendWithBackpressure`): a client with more than 1 MB queued stops receiving snapshots (the next one replaces them), and one with more than 8 MB queued is disconnected, so a slow client cannot grow the server's memory without bound.
- **Compression:** WebSocket `permessage-deflate` (level 1, no context takeover, 8 KB window) cuts snapshot traffic by 3-4x at 100 players.
- **Metrics:** `GET /health` now includes `room` (`tickMsAvg`, `tickMsMax`, `overruns`, `strikes`, `kicks`, players) and `memoryMb`. The server logs every strike and kick.
- **Tick loop fix (found by the load test):** a plain `setInterval(50 ms)` ran at about 16 Hz on Windows (coarse timers), so the whole game ran 20% slow and inputs queued up for over a second. The room now wakes every 12 ms and runs the ticks that real time has earned (at most 4 to catch up).
- **Crash and duplication tests** (`dupe.test.ts`): a seeded fuzz of 6 x 1500 random clicks, shift-clicks, drops, hotbar changes, menu opens/closes, out-of-range slots and shared-chest opens by two players; at every hundredth step the total of watched items (inventories, cursors, crafting grids, the chest, items on the ground) equals the start. Also: a disconnect with items on the cursor gives them back; a restart never has more items than before (dropped items on the ground are not stored, so a crash can lose them but never copy them); a failing chunk write does not stop players from being saved and is retried; SQLite chunk writes are all-or-nothing; an unreadable stored player starts fresh; an account cannot be in two places at once.
- **Load test** (`npm run loadtest`, `scripts/loadtest.mjs`): `--clients N --seconds S`, or `--url ws://host:port` for a running server (raise `MAX_PLAYERS`, `MAX_CONN_PER_IP`, `CONNECTS_PER_MINUTE` on it). Each bot paces 60 inputs per second by the wall clock, walks, turns, digs, chats and changes hotbar slots. It fails on kicks, drops, socket errors, an average tick above 25 ms, more than 2% overrun ticks, fewer than 15 snapshots per second, or more than 100 KB/s per player on the wire. Results on a Windows laptop with the bots on the same machine, all players in one spot with mobs on (the worst case for snapshot size):

| Players | Tick avg / worst | Snapshots per player | Wire bandwidth per player | Input ack p99 | Memory |
|---|---|---|---|---|---|
| 20 | 2.6 / 12 ms | 20/s | 32 KB/s | 53 ms | 114 MB |
| 100 | 11.5 / 26 ms | 20/s | 72-77 KB/s | 79 ms | 254 MB |
| 200 | 33 / 48 ms | 12/s | 69 KB/s | 7 s | 1.5 GB (fails) |

That table is from before the shared serialisation below. After it (same machine, same test), 100 players cost about 6 ms per tick and 120 players 6.4 ms avg / 14 ms worst, 20 snapshots/s each, 74 KB/s per player, ack p99 80 ms, 291 MB. The default capacity is now 120 (`DEFAULT_MAX_PLAYERS`, `MAX_PLAYERS` changes it).

- **Load test with skills** (`npm run loadtest -- --skills`, server `scripts/loadtest-skills-server.ts`): every bot is a warrior, mage or ranger at level 30 with all its skills learned and a full resource bar, and presses a skill about once a second (about a quarter of the presses cast; the rest meet a cooldown). Nov 14, 2026, Ryzen 9 5900X, 120 bots in the Dawnwatch square, adventure world: before the two fixes below the server could not hold 120 in one spot even without skills (27.9 ms avg tick, 4.4% overruns, 18.6 snapshots/s, ack p50 1.8 s; with skills 43.6 ms, 7.5%, 11 snapshots/s, ack p50 3.5 s, 1 GB). After them: no skills 11.6 ms avg, 0 overruns, 20 snapshots/s, ack p50 56 ms, 90 KB/s, 286 MB; with skills 25.9 ms avg (worst 210), 3.3% overruns, 20 snapshots/s, ack p99 235 ms, 445 MB, but **200 KB/s per player on the wire** (over the 100 KB/s budget: the snapshots list every ability mark alive near the player, in full, 20 times a second; deltas or a compact form are the next thing to do).
- **What a crowd used to cost** (found with `node --cpu-prof` on the server): `Realm.scanWards` looked for soul lanterns by reading 216,000 blocks around *each* player in one tick every 2 seconds (120 players in one spot: about 350 ms, a stall for everyone). It now cuts the space into cells of 8 blocks, reads each cell once however many players are near it, and spreads the reading over up to 20 ticks. And footsteps, jumps and landings were sent to everyone within 48 blocks (a million sounds in 45 seconds with 120 bots): they now carry `STEP_RANGE` = 16 blocks, and a player is told of at most `STEP_SOUNDS_PER_TICK` = 6 of them per tick (their own always). Ability casts themselves send no sound to others; their marks and projectiles are in the snapshots, limited by distance. `crowdLoad.test.ts` checks both.
- **Lighter snapshots for a crowd** (`room.ts` `framesFor`, `crowdSnapshots.test.ts`): a recipient gets the full state of its `NEAR_PLAYERS` = 24 nearest players every snapshot, but the farther ones (up to `VIEW_PLAYERS`) only every `FAR_PLAYER_EVERY` = 4th snapshot (a different quarter each time); the ids of those left out go in `keep` so the client does not drop them (it smooths movement anyway, and far players are drawn as blocks). Below 24 players in view nothing changes. Ability effects (`fx`) are sent in full once (or again if they move), then only as ids in `fxKeep`; only those within `VIEW_FX` = 64 blocks, at most `MAX_FX` = 48 nearest. Bandwidth with skills went from 200 to about 72 KB/s per player. `npm run loadtest -- --parts` prints the bytes by part of the snapshot, `--first N` numbers the bots from N, so two test processes can share one server.
- **Result** (same machine, 120 skill bots in Dawnwatch, two bot processes of 60 so the bots themselves do not stall): 23.6 ms avg tick (budget 25), 1.8% overruns (worst tick 219 ms, at joining), 20 snapshots/s, 72 KB/s per player, ack p50 64 ms, p95 111 ms. With all 120 bots in one test process the same server looks much worse (ack p95 over a second) only because that one Node process cannot read the snapshots fast enough. A real browser among them (`node scripts/watch-crowd.mjs`) draws 20 full figures and 99 blocks at 45 to 77 FPS.

- **Shared serialisation:** every snapshot lists the players in view, so the work grew with the square of the head count (each player was turned into an object and into JSON once per recipient). Now each player's view is built once per tick (`PlayerFrame`) and, for real sockets, written to JSON once; each recipient's snapshot is its own JSON with the shared player text spliced in (`withPlayersJson`, a test checks the bytes are the same as `JSON.stringify`). 18 ms to 6.5 ms per tick at 120 players. Connections without `sendSnapshot` (tests) still get plain objects.
- **Client crowd handling** (`playerRenderer.ts`, `LOD`): only the 20 nearest players within 36 blocks are full figures; the others are one coloured block, far ones are not drawn, name tags show within 40 blocks, far blocks relight every 8th frame. A full figure is also cheaper: each body part is one draw call (vertex colours light the six faces, the head and helmets use a texture strip) instead of six. With 99 bots in view the scene is about 200 draw calls and player sync takes under 1 ms (`scripts/crowd.mjs`, run by `npm run test:e2e`, checks this with a real browser; `?debug` gives `__solrift.crowd()`).
- **Realm status:** the title screen's multiplayer page shows "Online 37 / 120" or "Full" from the `welcome` message (`players`, `max`), and `/health` has `maxPlayers`.
- **Heartbeat:** any message from a client counts as a sign of life, not only the pong, so a browser that is busy or in a background tab (slow to answer a ping, but still sending inputs) is no longer dropped. `HEARTBEAT_MS` changes the ping interval (default 15 s). `LOG_CLOSE=1` logs why sockets close.

One room holds 100 players with room to spare on one core with the load generator competing for CPU; 250 clustered players on the same laptop is beyond it (the bots and the server fight for the CPU, snapshots fall to 10/s). Bandwidth grows with the number of players in view (each snapshot lists every nearby player and mob), which is the first thing to optimise next (delta snapshots, lower rate for distant entities, compact encoding).

Known limits after 3.6: no block prediction; one room per server; the web client shows "reload to reconnect" instead of reconnecting by itself; snapshots are full (not delta) lists; the load test runs the bots and the server on one machine.
## 10. Decisions assumed (tell me if any should change)

1. Cloud saves require a wallet login. Guests have local saves and file export only.
2. Dev uses SQLite and local disk, production uses Postgres and S3/R2 behind the same interfaces.
3. Progress is never stored on-chain.
4. Public name is a display name. The wallet address is private by default.
5. Single-player worlds are sandbox-only and cannot export items to official worlds.
