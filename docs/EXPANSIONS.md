# SolRift expansions

SolRift grows the way an MMO does: the **core game** is the first chapter, and each **expansion** after it is a named
chapter with its own theme, zones, bosses, instances and dungeons. The full name of the game with an expansion is
"SolRift: <expansion name>", for example "SolRift: Embers of the Hollow King".

## The list

The single source of truth is `packages/shared/src/expansions.ts` (`EXPANSIONS`). The title screen reads it (the
"Expansions" section and the line under the PLAY GAME button), and the server and the saves will read it later.

| Order | Id | Name | Status | Theme |
|---|---|---|---|---|
| 0 | `core` | SolRift | live | The open world, caves, villages, dungeons, crafting, multiplayer |
| 1 | `hollow-king` | Embers of the Hollow King | live (the expansion at launch) | Deep underground: first instances (the Cinderdeep, Gloomhold Catacombs), the bosses Ashmaw and the Hollow King, party finder and lockouts |
| 2 | `drowned-throne` | Tides of the Drowned Throne | announced | The sea: the Sunken Reach, Marrowtide Caverns, the first raid and Thalassa, the Drowned Queen |
| 3 | `sky-titans` | Crown of the Sky Titans | announced | Floating isles, the Citadel of Storms and the Storm Titan |

Everything under an expansion that is not `live` is a plan. The UI labels it "Not playable yet", and a test
(`expansions.test.ts`) fails if a piece of content is marked `playable` before its expansion is live.

## Statuses

- `live`: playable now. `core` and `hollow-king` (the first expansion, the one the game launches with) are live.
- `in-development`: being built. At most one at a time; the title screen's hero shows it as the next arrival.
- `announced`: planned, with a name and a theme.

## Adding an expansion

1. Add an entry to `EXPANSIONS` (next `order`, a URL-safe `id`, a `subtitle`, a tagline, a blurb, a status, an accent
   colour and its content list). Content kinds: `boss`, `instance`, `dungeon`, `raid`, `zone`, `feature`.
2. Add a picture in `apps/web/src/components/homeAssets.ts` (`EXPANSION_SHOT`, keyed by id). Take new ones with
   `node scripts/shots.mjs` when the content exists.
3. Run `npm test` (the list is validated) and `E2E_ONLY=home node scripts/e2e.mjs` (the front page shows it).

## Shipping content for an expansion (the plan, not built yet)

When the first expansion is built, these are the pieces it needs. Each one is a separate piece of work:

- **Instances and dungeons:** a generated or hand-built map per run, entered through a portal, with its own copy of
  the world state so one party's changes never reach another. The server owns it (a second `Realm` per instance, as
  the room already has one `Realm` per world). Saves record which expansions a world has unlocked.
- **Bosses:** server-side mobs with phases (the mob model in `packages/shared/src/mobs.ts` gains attack patterns and
  a health bar in the snapshot), loot tables in `loot.ts`, and a kill record per player.
- **Lockouts and party finder:** a per-account weekly lockout per instance (stored with the account in the server
  database), and a party list over the network protocol.
- **Gating:** `liveExpansions()` says what a server runs; content ids live in the expansion's own range so old saves
  and old clients keep working.

Nothing above exists yet. Keep this file in step with what is built.


## Adventure mode (a preview of the first expansion)

Adventure is the **multiplayer** game: the online server runs it, and it is the only realm on the title screen (Multiplayer, "Dawnwatch"). It is a fixed world built for the WoW-style chapters of the expansions, and plays like this:

- **The spawn.** Everyone starts on the same paved square (12 x 12 blocks, `SPAWN_X0/SPAWN_Z0` in `packages/shared/src/adventure.ts`), each player on a cell of their own, in the village of **Dawnwatch**.
- **Quest givers.** Four villagers (`NPCS` in `packages/shared/src/quests.ts`) with a `!` over their head when they have a quest, a yellow `?` when one can be handed in, a grey `?` while you are on it. Right-click one to talk. The dialog offers, takes in and pays quests.
- **The quests** (`QUESTS`): ten of them, from "Welcome to Dawnwatch" through first logs, a workbench, stone tools, a furnace, hunting, cooking and a night watch, to the dungeon. Plain data, so a new chapter is a new entry. Objectives are `collect`, `craft`, `smelt`, `kill`, `mine`, `place` and `enter`; kills count for everyone nearby (group credit).
- **The dungeon is a separate map, one copy per player.** The Hollow Cellar is entered through a **portal** (`B.PORTAL`, a non-solid violet block) in the ruined chapel east of the village; there is no stairway. Stepping into it sends the player (`Realm.usePortal`) to their own copy of the dungeon: a gatehall, a crypt and a vault with three spawner cages and chests, with a portal back at the start of the gatehall. How it works:
  - The copies live in a field of the same world, far to the east (`INSTANCE_X0/Z0` 4096, 48 slots, `INSTANCE_STRIDE` 48 blocks apart in z). Each copy is solid rock to the sky with the rooms cut into it, generated purely from the seed (`AdventureWorldGenerator.instanceChunk`), so server and clients agree without sending anything. The generator exposes it through `instanceCount/At/Entry/Exit/Bounds` and `spawnerAt` (base `WorldGenerator` has trivial defaults, so other worlds have none).
  - `Realm` gives each player a copy by `Player.instanceKey()` (the player's own name when solo, or the party's key). A copy is kept for `COPY_KEEP` = 90 seconds after its last occupant left (so a disconnect or a fall does not lose progress), then wiped: blocks, chests, spawners, mobs and drops are restored, which is also the dungeon reset. If every slot is taken the portal says so and the player stays in the village.
  - Instance chunks are never saved (`editedChunks` and `loadEdited` skip them) and chests there are swept on load, so a restart starts every copy clean and a player who logs in inside one is sent back to the chapel.
  - Natural mob spawning is quiet inside copies (the cages make the monsters), and zone, protection and loot all follow the copy: the walls, floor and chests are protected, the spawner cages stay breakable.
  - **Entry requirements.** `WorldGenerator.instanceRequirement()` returns `{ name, level?, item?, consume? }`. The Hollow Cellar asks for level `DUNGEON_MIN_LEVEL` (5). A survival player who does not meet it gets a toast ("... is for level 5 and up. You are level 2.") and is put back out in front of the portal; creative players always pass. A dungeon can also ask for a **key item** (say one a monster drops): it must be carried, `consume: true` uses one up when a new copy is opened, and coming back to a copy you still have open costs nothing. To gate a new dungeon, override `instanceRequirement` in its generator; to make a key, add an item and put it in a mob's drops or a loot table.
  - Walking in shows the place banner and counts for the `enter` objective.
- **Protected places.** The realm is shared and permanent, so one player must not be able to wreck it for the rest. `WorldGenerator.isProtected` (overridden in `AdventureWorldGenerator`) marks the whole village (bedrock to sky), the chapel and the whole dungeon field. The server refuses breaking, placing, tilling, flint, buckets there (with a toast), and explosions, fire and flowing water leave it alone (`Player.breakLocked/placeLocked`, `Realm.explode`, the fire and fluid hosts). Creative mode (operators, online only with `cheats`) bypasses it; the wilderness around stays fully editable, which is where the quests send players to mine. Monster spawners are the one exception, since a quest asks for them to be destroyed.
- **Quest-giver leash.** As a safety net, `Realm.updateNpcs` puts a quest giver back on their station (clearing the air and mending the floor) if they stray more than `NPC_LEASH` blocks or find themselves walled in.
- **Parties** (`packages/shared/src/party.ts`, `Realm.parties`). Up to `MAX_PARTY` = 4 players share one copy of a dungeon. Chat commands, handled by the server room: `/party invite <player>`, `/party accept`, `/party decline`, `/party leave`, `/party kick <player>`, `/party leader <player>`, `/party list` (or just `/party`), and `/p <message>` for party chat. The first accepted invitation makes the party with the inviter as leader; only the leader invites and removes; invitations last 60 seconds; when the leader leaves or disconnects the next member leads. `Player.instanceKey()` is the party's key, so everyone walks into the same copy; a copy the leader already had open goes with the new party (`Realm.rekeyCopy`). Each member still has to meet the dungeon's requirement (level; the key is only spent by whoever opens the copy). Anyone who leaves or is removed while inside is put out by the realm within a second, and joining a party while inside your own copy does the same (the copy is no longer yours).
- **The party on screen** (`apps/web/src/components/PartyUI.tsx`). The server tells each player their party and who is inviting them (the `party` event, sent only when something changes; `Parties.sync`). A **party frame** on the left lists the members with level and health bars (the leader has a crown); an **invitation** pops up in the middle of the screen with Accept and Decline buttons, and `Y` / `N` answer it without leaving the game; **`P`** opens the party window: invite by name, make a member leader, remove a member, leave. The buttons send the `party` command (`PartyAction`); the chat commands stay as shortcuts.
- **The village is safe.** `WorldGenerator.safeFromMonsters(x, z, margin)` (Adventure: the whole of Dawnwatch, `HUB_HALF` around the origin). No monster is born in it or within `SAFE_BUFFER` (24) blocks of it (`SpawnEnv.noMonsters`: land, caves and drowned alike), and a hostile mob that wanders or is carried in is removed at once (`MobEnv.safe`), so nothing reaches the people inside. Animals and the quest givers are not affected. Monster cages of the dungeon are far away in their own field.
- **Known gaps.** The village cannot be restored if an operator damages it. Parties have no nameplates over heads yet, monsters do not get tougher with more players in a copy, and the portal has no fade or sound on the client.
- **The map** (client only: `apps/web/src/game/mapData.ts`, `components/MapUI.tsx`). `MapData` paints the ground top-down, one 16x16 picture per chunk, from the blocks the client has loaded (`World.chunkData` / `chunkRev`; a chunk is painted again when it was edited) and keeps the pictures after the chunks unload, so the map shows where you have been (it is not saved between visits). The **minimap** (top right, `J` hides it; the choice is remembered) is drawn from it, with your arrow and other players; underground or indoors (a roof more than 6 blocks above) it shows the level you stand on instead (`levelSlice`, cut at head height). The **map item** (`I.MAP`, the reward of the first quest, also crafted from 3 paper and a coal) is held like any item; **right-click** with it in hand brings a big map up in front of you (`mapUp` in the UI store; the hand is hidden meanwhile), the wheel zooms (1, 2 or 4 pixels per block), and a second right-click, another slot, a menu or Esc puts it away. Colours come from the average of each block's top texture (fixed greens for grass and leaves, blue by depth for water). Tests: `mapData.test.ts`, `scripts/map.mjs`.
- **The UI.** Quest tracker (top right, below the minimap), quest log (`L`), place banners, quest notes and a fanfare.
- **Servers.** The game server runs the Adventure world by default (`WORLD_KIND=overworld` runs the plain generated one, which the core-game tests use). Adventure is not offered in single player: the client refuses it offline unless the address has `?debug`, which developers and the e2e suite use. Storage is kept apart from an overworld with the same seed.
- **Tests.** `packages/shared/src/{adventure,quests,adventureSession,adventureProtection,dungeonInstances}.test.ts`, `apps/server/src/adventureRoom.test.ts` and `scripts/adventure.mjs` (with screenshots).

It is listed under *Embers of the Hollow King*, the first expansion, which is marked `live` (the one the game launches with); the registry only allows `playable` content in a `live` expansion, so every piece of it is marked playable. Note that the Cinderdeep, Gloomhold Catacombs and the two bosses are not built yet: they are listed because the launch expansion is meant to ship with them. Next in the plan: a boss for the cellar, more chapters (smithing, enchanting, trading, the Nether-like zones) so the chain ends with every system of the game taught.
