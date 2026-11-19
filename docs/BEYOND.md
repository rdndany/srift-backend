# The World Beyond

A second, procedurally generated world inside SolRift: an endless planet with 110 biomes, signature realms, a layered
underground, 35 kinds of places, living weather and a Codex that records what the traveller finds. It is a **world kind**
beside the overworld and the handcrafted Adventure map, not a new game: same chunks, same blocks, same server rooms.

## How to play it

| Way | How |
| --- | --- |
| Single player | Play page, step 2, "Which world" -> **The World Beyond** (saved apart from the overworld) |
| Link | `/?world=beyond&seed=<n>` |
| Server | `WORLD_KIND=beyond node apps/server/dist/index.js` (the room then generates the Beyond for everyone) |
| In game | `/world` shows the world kind; **B** opens the Codex |

Saves are keyed `${seed}-${kind}` on the web and `-2_000_000_000 - seed` on the server, so the Beyond never overwrites an
overworld or Adventure save with the same seed.

## Architecture (all in `packages/shared/src`, no browser APIs)

```
beyondBlocks      new blocks (ids from 3016, append-only) + procedural tile painters
beyondBiomes      the 110-biome catalogue: family, rarity, climate niche, surface blocks, flora, fauna, atmosphere
beyondRealms      the ten signature realms as ragged discs laid on a coarse grid
beyondTerrain     multi-scale deterministic noise: continents, mountains, rivers, temperature (lapse rate),
                  rainfall (rain shadow), biome choice by tiered niche scoring
beyondSurface     ground blocks per biome, beaches, snow lines, rock bands
beyondFlora       trees, features and ground cover per biome (deterministic per column)
beyondUnderground cave ecosystems by depth (caverns, deep, abyssal), ore bands, connected to the surface
beyondStructures  35 places on per-rarity grids (common ... legendary), chests and loot
beyondRealmFeatures sky islands, shattered islands, Worldroot tree, volcano, spires (analytic per column)
beyondWorld       BeyondWorldGenerator extends WorldGenerator and wires all of the above
beyondDiscovery   the DiscoveryLog (pure), 23 achievements, Codex pages
beyondAtmosphere  skyOf(): sky, fog, precipitation, ambient bed and wind per biome and weather
```

Rules the code keeps:

* **Deterministic.** Every function is a pure function of `(seed, x, z)`; chunks agree on their borders because anything
  that crosses a border (places, rivers, trees) is drawn by every chunk it touches.
* **Lazy.** Chunks are generated on demand; nothing is precomputed beyond small caches.
* **Adventure untouched.** `WorldGenerator` and the handcrafted Adventure map are unchanged; the Beyond only overrides
  hooks (`createTerrain`, `groundFor`, `fillSea`, `underground`, `dress`, `lootAt`, `wildlifeAt`).
* **Server-authoritative.** Mobs spawn through the existing `SpawnEnv.wildlife` hook, so wildlife is chosen on the
  server from the biome. The Codex is a client-side record only (it grants nothing).

## Nothing hangs, everything is finished

The Beyond never leaves a block floating in the air and never leaves a building half drawn (the drifting islands of the Sky Islands
and the Shattered Realm are the one deliberate exception). It is done in layers, all pure functions of what was drawn, so every chunk
that touches a thing reaches the same answer (`support.ts`):

* `keepRooted`: a list of blocks is cut down to those that touch (face, edge or corner) a rooted block. Used for every tree
  (`shapeBlocks`), every feature (spires, ribs, boulders, vents, reefs: drawn whole, then pruned) and every place.
* **Claims**: places, villages and castles claim their ground (`claims()`); no tree or feature is rooted near one, so none is cut
  by a building's clearing. `Site.level` also clears whatever reaches over its cleared volume.
* **Places** (`BeyondStructures.analyse`): a place is drawn once into scratch chunks. A wall, post or pillar that stops one or two
  blocks short of the ground is carried down to it; what a ruin's decay cut off from the ground is left out (and its chests with
  it). Rarer places keep their ground (`crowded`): no two places overlap, and none stands on a village or castle (a castle
  is vetoed near a village).
* **Chunks** (`dropHovering`, run at the end of the Beyond's `dress`, before the realms add their islands): any piece of 600 blocks
  or less that touches neither the bottom nor the sides of the chunk is removed (it becomes liquid where it was in liquid).
  Water holds a lily pad or a sheet of ice at the surface, never a block in a cave.

Known residue: a piece that runs over a chunk edge is kept, so a rare pocket of cave rock (a few blocks, once in ~1000 chunks, a
bigger island twice in ~5000 chunks, always underground in flooded caverns) can survive; the same goes for kelp over a
cave mouth. `beyondSolid.test.ts` guards the surface (no floating block round a place of every kind or over seven stretches of country)
and the buildings (whole, no overlaps).

## Client

`apps/web/src/game/beyondClient.ts` eases fog, sky, light and precipitation toward each biome's atmosphere, scatters
ambient particles (embers, spores, motes, dust), switches the snow mode of `Rain`, and picks an ambient bed in
`GameAudio.setBed` (synthesised, no audio files). Twice a second it asks where the traveller is and feeds the
`DiscoveryLog`. `CodexUI` shows the book (Biomes / Places / Caverns / Deeds) and slides finds in as notes.
Debug hooks (`?debug`): `__solrift.beyond()`, `__solrift.beyondBiomeAt(x, z)`.

## Tests

* `packages/shared/src/beyondData.test.ts`: the catalogue (110 ids, families, rarities, block/tile integrity, no
  duplicate tiles, `BB.<key>` typos).
* `packages/shared/src/beyondWorld.test.ts`: determinism, cross-chunk consistency, biome distribution and rarity
  frequency, transitions, climate consistency (snow only where cold or high, deserts dry), rivers reach the sea,
  oceans, mountains, caves connect to the surface, structures and their loot, vegetation, signature realms across seeds,
  Adventure preservation, performance budget per chunk.
* `packages/shared/src/beyondSolid.test.ts`: no floating blocks, trees and places whole, no overlapping places, castles off villages.
* `apps/server/src/beyondRoom.test.ts`: a room runs the Beyond, saves are isolated, two clients see the same blocks.
* `scripts/beyond.mjs` (Playwright, part of `npm run test:e2e`): the picker, loading, the Codex filling while travelling,
  the notes, B opening and closing the book, no console errors.

## What remains / known limits

World
* Lakes and rivers sit at sea level (the per-column `water` level is always 0), so there are no mountain lakes.
* Cave-flavoured biomes in the catalogue (85 Underground Rivers, 94 Glowing Mushroom Caves) are represented by cave
  ecosystems underground, not as surface biomes.
* Signature realms are ragged discs; their rims can come within about 280 blocks of the start, and a given window may
  not contain all ten (all were found across seeds 1-4).
* Emerald Hollow has no dome or sinkholes; Drowned Kingdom has structures plus the sea statue only; Sunken Earth is a
  terrain caldera only; Pale Wastes has the dragon skeleton only.
* Kelp and similar plants sit in water cells and could be washed away by fluid updates.
* Hostile mob pools still follow base ground blocks; only the wildlife (passive/ambient) follows the biome.
* `findSpawn` takes about 1.2 s on the first call; `placeOf` caches 6000 entries, so very large `near()` scans are slow.

Client
* Wind only moves particles; grass and flags do not sway.
* The minimap and map use the legacy biome colours; there is no dedicated Beyond biome map.
* Beyond saves are not listed under "Your worlds" on the play page.
