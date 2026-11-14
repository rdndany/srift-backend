# SolRift world: how it works, and how it compares to the classic design

This is the technical gap analysis between SolRift's world and the original game's, written before the
world overhaul (Nov 8, 2026) and updated with what the overhaul did. It also documents the design of the
new pieces. Everything here is original code and original art.

## 1. The architecture already matched the original's

An audit of `packages/shared` and `apps/web` found that the structure the original uses was already there:

| Original | SolRift |
| --- | --- |
| 16 x 16 columns streamed around the player | Chunks of 16 x 16 x 256 (`chunk.ts`), loaded by distance and generated in a worker pool (`apps/web/src/game/world.ts`) |
| World = seed + noise layers | `WorldGenerator(seed)` (`worldgen.ts`): continent, hills, mountain ridges, temperature and humidity noise give height and biome; `columnAt(x, z)` is a pure function |
| Features generated per chunk, identical whichever neighbour loads first | Every feature writes only its own chunk's cells and derives from the seed (`hash2`, `mulberry32`); tested ("deterministic whatever order") |
| Chunk meshing with face culling and separate opaque and translucent passes | `mesher.ts`: greedy meshing over a 3 x 3 chunk window, per-corner ambient occlusion, an opaque and a translucent builder, lowered liquid surfaces |
| Sky light and block light | `lighting.ts`: flood fill, two channels, recomputed for the 3 x 3 window while meshing |
| Block entities stored apart from terrain | `blockEntities.ts`: chests and furnaces in a map keyed by position, saved in the world state, not in chunk data |
| Server-authoritative edits | `Realm` is the one simulation; the online server runs it and sends block changes |
| Only edited chunks are saved | `World.modifiedChunks` and `WorldState` |

So the work was not "rewrite the engine", it was "fill the world with the content the engine was missing".

## 2. The gaps, and what was done

| Area | Before | Now |
| --- | --- | --- |
| Caves | Two noise fields, never reaching the surface, no lava, no water | Noise tunnels and halls **plus worm carvers** (`caves.ts`): winding tunnels that fork, lumpy rooms, and **ravines**; they open onto the surface; lava below y 10; flooded caves; no cuts next to open water |
| Liquids | Water only, no swimming-style hazard | **Lava** block: glows (light 15), slows you, burns players and mobs, destroys dropped items |
| Flowing liquids | Static source blocks | **Flowing water and lava** with levels (`fluids.ts`), waterfalls, infinite water, obsidian and cobblestone where they meet, and **buckets** to scoop and pour (section 4) |
| World size | 128 high, sea level 36 | **256 high, sea level 63** (`chunk.ts`); old saves load (section 6) |
| Trees and water | One oak, no lakes | **Oak, birch and spruce** by biome, **lakes** (frozen in the snow) on flat land |
| Colour | One green, one blue | **Biome tint** for grass, leaves, tall grass and water from a climate grid (section 5) |
| More structures | None | **Desert temples** with four chests in a sealed chamber; **rails, cobwebs and cave spider nests** in mineshafts |
| Creatures | Pig, cow, zombie, skeleton, creeper | **18 kinds**: sheep, chicken, rabbit, squid, bat, spider, cave spider, slime, enderman, husk, stray and drowned as well (section 7) |
| Terrain | Biomes, no rivers | **Rivers** carved from a zero-crossing noise field; sandstone under desert and beach sand; **granite, diorite and andesite** blobs and dirt pockets in the stone; more ore |
| Surface | Grass, flowers, trees | **Cactus** (stands on sand, pricks, pops off when a neighbour touches it) and **dead bushes** in deserts |
| Structures | Villages only | **Dungeons** (monster rooms with a spawner, mossy floor, one or two chests) and **mineshafts** (3 x 3 corridors with timber frames, torches, side tunnels, wider chambers, chests) next to the existing villages |
| Chests | Always empty | **Loot tables** (`loot.ts`) for dungeons, mineshafts and village houses; contents rolled from the seed and position when first opened |
| Spawners | None | **Monster spawner** block: zombies or skeletons while a player is within 16 blocks, at most six near it, a new batch every 10 to 40 s; pays 15 to 43 xp when mined; drops nothing |
| Block physics | Blocks never moved | **Sand and gravel fall** (`Realm.checkFall`, `updateFalling`) |

Still different from the original, deliberately or for now:

- **World height is 256, not -64 to 320.** Sea level is 63 as in the original, but there is nothing below
  y 0 and no depth-dependent ore table beyond the simple one in `worldgen.ts`.
- **Fluids are simple.** Flat tops (no smoothing of the surface towards the flow), no current that pushes
  you, no bubble columns, no waterlogged blocks, no aquifers with their own rules (caves flood by noise).
  Filled buckets can only be obtained by using an empty one on a source.
- **Tint is coarse.** The climate is quantised to 8 x 8 steps and borders between steps are hard, not
  blended over 5 x 5 columns as in the original. Only grass, oak leaves, tall grass and water are tinted
  (birch and spruce leaves keep their own colours).
- **No minecarts.** Rails are decoration; there are no powered rails, no carts, no redstone at all. No
  shears or silk touch, so ice and leaves cannot be picked up as blocks (a cobweb gives string).
- **No TNT trap** or pressure plate in desert temples, and no strongholds, ocean monuments, jungle or
  swamp biomes, clay or sugar cane.
- **Sheep are white and drop wool only on death.** No dye, no shearing, no breeding of any animal, no
  taming.
- **No per-section palettes.** Chunks are flat `Uint8Array`s (one byte per block). With about 100 block ids
  that is still the compact form; sections and palettes pay off beyond 256 states.
- **No region files.** Chunks that a player edited are saved as a whole (compressed) in the player's save;
  everything else is regenerated from the seed. That is simpler and is enough while worlds are small.
- **Old saves show a seam.** A world saved before generator version 2 keeps its edited chunks (padded with
  open sky up to the new height), but every chunk the player never edited is regenerated by the new
  generator, so terrain can change abruptly at the border of the edited area.

## 3. Generation pipeline

`WorldGenerator.generateChunk(cx, cz)`:

1. Column fill: bedrock, stone, soil layers by biome (sand over sandstone in deserts and beaches), noise
   caves below the surface, water up to sea level (63). Heights of the chunk and a one block ring are kept.
2. `carve`: the worm carvers' spheres cut tunnels, rooms and ravines.
3. `placeOres` (random-walk veins, stone only) then `placeBlobs` (granite, diorite, andesite, dirt).
4. `structures.apply`: dungeons, mineshafts and desert temples.
5. `placeLakes`: ponds on flat land (below).
6. `placeTrees` (oak, birch, spruce), `placePlants` (grass, flowers, cacti, dead bushes).
7. `villages.apply`.
8. `structures.applyCastles`: last, so nothing grows or stands through a castle (it clears its own ground).

`GENERATOR_VERSION` (`save.ts`) is 2: it was bumped when the height and sea level changed.

### Cave carvers (`caves.ts`)

A carver is planned from the chunk it starts in: about one chunk in five starts a system of up to four
caves (a start point biased towards the bottom, 1 to 4 tunnels, sometimes a room first), and about one in
fifty starts a ravine. A tunnel is a walk of up to 64 steps: yaw and pitch drift randomly, the radius is
`1.5 + sin(step * pi / length) * thickness`, and a thick tunnel may fork into two thinner ones. Each step
becomes an ellipsoid (`CaveSphere`). A ravine uses the same walk with a vertical radius of 3.2 times the
horizontal one and a width that wobbles.

A chunk being generated asks every chunk within 5 (`CAVE_REACH`) for its plan and cuts the part inside
itself. Plans depend only on the seed and the start chunk (they are cached, not stateful), which is why two
neighbouring chunks agree on a tunnel without talking to each other. Rules while cutting: the floor of every
ellipsoid is kept flat, bedrock and the bottom layers are never cut, nothing is cut under or beside open
water, and the surface block of a possible tree position is spared so trees never float over an entrance.
A cut cell becomes lava (y <= `LAVA_LEVEL` = 10), water (where the aquifer noise says the cave is flooded)
or air.

### Structures (`structures.ts`)

Like villages, a structure is a **plan**: a list of box operations (`set`, `solid`, `open`) and the
positions of its chests. A chunk writes the operations that touch it, so a structure that crosses chunk
borders comes out whole whichever chunk loads first.

- **Dungeon**: one candidate per chunk (30 percent), centred 4 to 11 blocks into the chunk so it never
  leaves it. Rejected unless dry land with at least 8 blocks of rock above. 5 x 5 to 7 x 7 interior, 4
  high, a floor of mossy and plain cobblestone, a spawner in the middle, up to two chests against the walls.
  The walls only replace solid cells, so where a cave runs past, the room opens into it.
- **Mineshaft**: one per 128-block region (55 percent), 14 to 27 blocks below the surface, rejected under
  the sea or under thin rock. A main corridor 32 to 60 blocks long with side corridors, planks over gaps in
  the floor, timber frames every four blocks, torches, chests and chambers at the ends.

Neither plan stores chest contents. `lootAt(x, y, z)` answers "which table does the chest here use", from
the plan.

### Chests and loot (`loot.ts`, `blockEntities.ts`)

A chest in a structure is not stored in the chunk. `BlockEntities.chest(x, y, z)` asks the realm's `loot`
provider (`generator.lootAt` then `rollChest(table, positionRand(seed, x, y, z))`) the first time the chest
is needed and fills 27 slots at random positions. The position is then remembered in the `rolled` set, which
is saved with the world: emptying a chest, breaking it, or replacing it never makes loot appear again, and a
chest a player placed is always empty. A reloaded world rolls the same items, because the random source is
a hash of the seed and the position. There is nothing purchasable here: every item in the tables can also
be found or made while playing.

## 4. Simulation additions

- **Lava** (`physics.ts`, `player.ts`, `mobs.ts`, `dropEntities.ts`): `Body.inLava` is true when the feet or
  hips overlap lava (it also sets `inWater`, so swimming and fall-damage immunity work), movement is slower
  than in water, 4 damage every 0.5 s starting at once, mobs take the same and burn, items are destroyed.
  Not hurt in creative or while spectating. The camera tints orange and the fog closes in when the eye is in
  lava.
- **Falling blocks** (`realm.ts`): sand and gravel (`FALLS` in `blocks.ts`) are scheduled by `checkFall`
  (after placing, and from `settleAround` when a block is removed) and move one cell per 0.06 to 0.12 s,
  through air, water, lava and plants. They are moved cell by cell, not simulated as entities, which keeps
  them identical on every client. A block that would land on a player becomes an item instead.
- **Spawners** (`realm.ts`): once a second, for every living player, the cube of 16 blocks (and 8 up and
  down) is scanned for spawners; each keeps a ready time. The kind of mob is a hash of the spawner's
  position (`spawnerKind`), so a spawner needs no saved data.
- **Cactus** damage, `canStayAt` rules for cactus and dead bush, `BLOCK_XP` for spawners.
- **Darker caves**: the web client fades the sky-coloured fog to black when the camera is well below the
  surface (`caveDark` in `main.ts`), so a cave has a dark horizon.

### Flowing water and lava (`fluids.ts`)

Fluids are ordinary block ids that carry their level: `WATER` (5) is a source, `WATER_1`..`WATER_7` (60-66)
are flowing water that has gone 1 to 7 blocks from a source, `WATER_FALL` (67) is water falling; lava has
`LAVA` (37), `LAVA_1`..`LAVA_3` (68-70) and `LAVA_FALL` (71). One byte per block still holds everything and
nothing needs saving: a fluid is just terrain.

`FluidSim` is a set of dirty cells, run by `Realm.fluids` every tick. A changed block (placed, broken, a
bucket) wakes its neighbours. Water steps every 0.25 s and spreads up to 7 blocks; lava steps every 1.2 s
and spreads up to 3. A cell first tries to fall; only fluid that has landed (or sits on fluid) spreads
sideways, and a source always spreads. A flowing cell with no feeder (a source or a higher neighbour) drains
away one level at a time. A cell with two or more water sources beside it over a solid floor becomes a
source itself (infinite water, as in the original). Meeting rules: a lava source touched by water becomes
obsidian, flowing lava touched by water becomes cobblestone, lava flowing into water makes stone. Fluid
washes away plants, torches and other non-solid blocks. Buckets (`Player.useBucket`) scoop a source into a
filled bucket (lava too) and pour one back; flowing water cannot be scooped. In survival the bucket changes
into its filled form and back; in creative nothing is used up.

The mesher draws the surface of a flowing cell lowered by its level, side faces only where the neighbour is
lower, and water two cells tall as one column. `WORLD_HEIGHT` 256 and `SEA_LEVEL` 63 are used by the
generator (every height offset scales from them), the mesher, lighting and the spawner; `decodeChunk` pads
a chunk saved at 128 blocks with air, and the IndexedDB storage migration pads the raw legacy chunks.

### Trees, lakes and tint

- **Trees** (`trees.ts`): `TreeKind` is oak, birch or spruce, each with its own log, leaf and sapling. Oaks are
  round and short (4-6 trunk), birches slimmer and taller (5-7), spruces a cone (6-9 trunk). `treeKindAt`:
  spruce in snow and taiga, birch in forest patches (a noise decides the density, with a few in the rest of
  the forest), oak elsewhere. A sapling grows into its own kind (`growTree`); birch and spruce leaves drop
  their own saplings.
- **Lakes** (`worldgen.ts`, `placeLakes`): about one chunk in five asks for a pond of radius 3 to 6 blocks on
  flat dry land (height varying by at most 2 over the whole pond and its bank, not in oceans, beaches,
  deserts or mountains). The water is two layers deep over a sealed bed of sand or gravel, the air above it
  is cleared, trees keep out (`inLake`) and in the snow the top layer is ice. `nearestLake` finds one for tests
  and the debug hooks.
- **Tint** (`biomeColors.ts`): `climateAt` gives temperature and humidity (0..1); `tintGrid(cx, cz)` packs one
  byte per column (`temperature * 8 + humidity`). The mesher puts a palette index on the vertices of grass,
  oak leaves, tall grass and water (`light.a`); the chunk shader looks the index up in a 256 x 1 palette
  texture (index 0 is untinted, 1-64 grass and foliage, 65-72 water) and multiplies by the ratio to the
  atlas base colour. Untinted pixels of those textures are marked by alpha 250 in the atlas, so the grass
  side keeps its dirt. Because the colour is a palette lookup, nothing is remeshed when the climate changes.

### Desert temples and mineshaft details (`structures.ts`)

- **Temple**: one candidate per region (`TEMPLE_REGION`), only on flat desert. A sandstone pyramid with a hall,
  two towers, a chiselled-sandstone mark, and below it a sealed chamber holding four chests of the
  `temple` loot table (richer than a dungeon: 4 to 7 stacks including diamonds and ender pearls). There is no
  door to the chamber: you have to dig. Reachable with `nearestStructure('temple', x, z)`.
- **Castle**: one candidate per 320-block region (`CASTLE_REGION`, 60% chance), on fairly level wooded or open
  land (plains, forests, taiga, snow, meadow, cherry grove, savanna, windswept hills). A grassy mound carries a
  26x26 curtain wall with a gate, a path, four corner towers (ladders, walkway doors, arrow slits, stepped blue
  wool roofs) and a three-storey keep (library, hall, treasury; two `dungeon` and two `temple` chests) with a
  lookout tower and a purple spire. Built in local coordinates and turned one of four ways by the seed.
  `nearestStructure('castle', x, z)`; `scripts/castle-look.mjs` takes screenshots. Chunks generated before the
  castle existed (old saves) do not get the parts that reach into them.
- **Mineshafts** now lay rails along the main corridor, hang cobwebs in the corners, and hide a **cave
  spider nest** (a spawner whose kind comes from the plan: `StructureGenerator.spawnerAt`, which `Realm`
  asks before it falls back to the zombie/skeleton hash). The first corridor always has a chest.

## 5. Mobs

`MOBS` in `mobs.ts` holds 18 kinds. `MobTraits` (`size`, `variant`) travel with the mob in saves and in the
network view (`MobView`): slime size (1, 2, 4) and rabbit coat (brown, white, sand).

| Kind | Where | Behaviour |
| --- | --- | --- |
| pig, cow, sheep, chicken, rabbit | grass by day (rabbits also on snow and sand) | wander, flee when hit; chickens glide down and take no fall damage; rabbits hop; sheep drop wool and mutton, chickens meat and feathers |
| squid | deep water, any time | swim freely, never leave the water, drop ink |
| bat | dark, enclosed air (caves, mineshafts) | flutter, harmless |
| zombie, skeleton, creeper | darkness | as before |
| spider | darkness, any ground | climbs any wall it walks into, pounces from a few blocks, neutral in daylight until hurt |
| cave spider | mineshaft nests | small, climbs, poisons: poison drains one heart point every 1.25 s, never below one heart |
| slime | below y 42 in "slime chunks" (about one in ten) | hops after you, splits into 2-4 smaller slimes when killed; only the smallest drops slimeballs |
| enderman | rare, only in the dark (never on open ground by day), any ground | passive until you look at it (crosshair raycast) or hurt it; 40 health, 7 damage per hit. Hitting it does not make it blink: it stands and fights. It blinks away from water, dodges nearly every arrow (and then hunts the archer), blinks to a hunted player who is more than 16 blocks off, and by day looks for cover or wanders off |
| husk | desert at night | a zombie that does not burn in daylight |
| stray | snow at night | a skeleton that shoots |
| drowned | deep water at night (at most 3 near you) | a zombie of the water, sometimes drops gold |

`MobSpawner` picks a pool from the block under the spawn point (grass, snow, sand, cave) and respects caps
(10 passive, 16 hostile, 5 squid, 4 bats, 3 drowned, 2 endermen). `SpawnEnv.slimeChunk` tells it which chunks
breed slimes. Hostile spawns still avoid light (torches within 5 blocks) and need darkness on the surface. Daylight counts under leaves (`isOpenToSky`: each leaf layer dims it, eight or more make it dark), so the floor of a forest spawns animals by day and no monsters; only real cover (stone, water) or a very deep canopy is dark. Damage on Normal matches the original: zombie, husk and drowned 3, spider and cave spider 2 (the latter poisons), big slime 4 and medium 2 (tiny ones are harmless), enderman 7, creeper blast up to about 43 at its centre (loor((f^2+f)/2 * 42 + 1) with  = 1 - distance/6).
Models are boxes drawn by `mobRenderer.ts` from a rig description with per-kind sounds in `audio.ts`.

## 6. Old worlds

`GENERATOR_VERSION` 2 (taller world, new terrain heights). A save made earlier loads: edited chunks are
padded with air above y 127 (`decodeChunk`, and for raw chunks in IndexedDB the storage migration), the
player keeps their position and inventory, and unedited chunks are regenerated by the new generator. Heights
do not match the old terrain, so there is a visible seam at the border of what was edited; builds are intact.

## 7. Tests

`packages/shared/src/world.test.ts` (48 tests): loot tables, generated chests, worldgen v2 (order
independence, caves and surface openings, lava only deep, bedrock intact, carver determinism and reach,
rivers, desert layers and plants, stone variants), dungeons, mineshafts across chunk borders, village chests,
lava, falling blocks, spawners, cactus and dead bush.

`village.test.ts` (21): village sites, order independence across chunks, and what the rebuilt villages
(`villageBuilders.ts`) are made of: real doors, whole beds, stair roofs, wood or sandstone by biome, fences,
trapdoor shutters, watchtower ladders and wool-awning stalls.

New with the nature update:

- `fluids.test.ts` (21): levels, drying up, falling, ledges, infinite water, washing plants away, timing,
  obsidian and cobblestone.
- `nature.test.ts` (44): tree shapes and sapling growth, three kinds of forest by biome, lakes (sealed, frozen
  in the snow, no trees), tint grid and palette, temples, mineshaft rails, webs and nests, cobweb physics,
  buckets, poison, legacy chunk padding.
- `mobs2.test.ts` (32): drops, spiders climbing and poisoning, slime splitting, enderman staring and
  teleporting, bats, squid, chickens, husks, strays, rabbit coats, and what spawns where.
- `mesher.test.ts`: flowing heights, culling, lava, rails, tint indices.

E2E (`scripts/*.mjs`): the `world` suite visits a cave, lava, a dungeon, a mineshaft, falling sand, lava
damage and a cactus; the `nature` suite checks tinted grass, the three trees, a lake, a temple, rails, a
waterfall, lava meeting water, a lineup of the new mobs and a squid tank and saves `nature-*.png`. The shield has `shield.test.ts` and the `shield` suite (saves `shield-*.png`). The bed has `bed.test.ts`, server tests in `room.test.ts` and the `bed` suite (saves `bed-*.png`). Building blocks have `building.test.ts` and the `building` suite (saves `building-*.png`). Dyes have `dyes.test.ts` and the `dyes` suite (saves `dyes-*.png`). The recipe book has its own tests: `recipeBook.test.ts` and the `recipes` suite.

## 8. Where to go next

In rough order of value for the effort: minecarts on the rails, shears and silk touch, more structures
(strongholds, ruins, ocean monuments), more biomes (jungle, swamp) with their own mobs, breeding and dye,
smoothed fluid surfaces and currents, blended biome tint, a depth below y 0, section palettes and region
files if worlds grow large.


## Terrain v3 (Minecraft 1.18-style world)

- Terrain comes from five noise fields (continentalness, erosion, ridges, temperature, humidity), giving oceans, beaches, plains, rivers, hills and snowy peaks.
- 30 biomes (ids 0-29, see `BIOME_NAMES`): plains, forest, birch/dark forest, taiga, snowy plains, ice spikes, desert, savanna, badlands, jungle, swamp, meadow, flower forest, cherry grove, windswept hills, mushroom fields, oceans and more.
- Temperature is split into bands and a band only touches its neighbours. Ice and snow never sit next to hot grass. `biomes.test.ts` checks this.
- New blocks use ids 1100+ (ground, rock, fungi, terracotta, gourds, four new trees, flowers, ferns, mushrooms, sugar cane, lily pad, pink petals). The atlas has 275 block tiles, so the mesher stores the tile in 9 bits.
- Biome tint: the packed column byte is `t*8 + h + 64*kind`. Kind 0 is plain, 1 swamp, 2 warm sea, 3 frozen water.
- `GENERATOR_VERSION` (`save.ts`) is stored as `terrain:<seed>`. When it changes, the server clears saved chunks for that seed.
- Dawnwatch village and the Hollow Cellar are kept. `ADVENTURE_LAYOUT` re-places them in the new terrain.
- Tools: `scripts/worldmap.mjs`, `scripts/biomes.mjs`.

## Terrain v4 (cave variety)

`GENERATOR_VERSION` is 4. Saved server chunks are cleared once on the first start after upgrade.

- **Cave shapes** (`worldgen.ts` `noiseCave`): spaghetti (variable width), noodle (thin) and cheese (big halls) caves, on top of the worm carvers and ravines in `caves.ts`.
- **Cave country** (`caveDecor.ts`): low-frequency noise picks lush caves (moss, azalea, glow berry vines, spore blossoms, clay pools), dripstone caves (stalactites, stalagmites, dripstone floors) and the deep dark (deepslate, sculk, glow lichen, below y 22).
- **Geodes**: amethyst geodes with a calcite shell and budding amethyst, with clusters inside. They are planned from the seed and applied from a 3x3 chunk neighbourhood.
- **Exposed ore**: ore shows on cave walls, so players see it while exploring.
- **Sealed tunnels** (`caves.ts` `seals`): about half of the tunnels at y 24-54 are plugged with a rubble wall studded with gold, diamond, emerald, lapis, redstone, iron and coal. The tunnel continues behind it, with a chest holding `cache` loot (`loot.ts`). Seals are planned with a separate RNG, so tunnel shapes are unchanged.
- **Client**: a zone banner appears when entering a lush cave, dripstone cave or the deep dark (`quests.ts` `ZONES`).
