# SolRift Adventure — "Embers of the Hollow King"

Story and quest design for the Adventure world, written from scratch. The old 13 quests and 3 chapters are dropped and not reused.

Files in this folder:

| File | Parts |
|---|---|
| `01-foundation.md` (this) | 1 Research, 2 Premise and mystery, 3 Villages and NPCs, 4 Progression map |
| `02-main-story.md` | 5 The 38 main-story quests (full format, with dialogue) |
| `03-side-quests.md` | 6 The 95 side quests and class lines (compact format) |
| `04-items-and-tech.md` | 7 Quest-item catalog, 8 Dependency graph, 9 JSON examples, 10 Assets and missing mechanics, 11 Pacing and balance, 12 Quality check |

**Rule used everywhere:** a quest only asks for things the game already does. Where it needs something that does not exist, it is marked with a tag (`[T1]`..`[T4]`, `[NEW-ITEM]`, `[NEW-NPC]`, `[NEW-ZONE]`) and listed in Part 10. Nothing is hidden inside a quest.

---

## PART 1 — What the game already has (read from the code)

### 1.1 Quest engine (`packages/shared/src/quests.ts`) — confirmed

| Capability | Detail |
|---|---|
| Objective kinds | `collect` (items in the bags), `craft`, `smelt`, `kill`, `mine`, `place`, `enter` (a named zone). That is the complete list. |
| All objectives at once | They count together, in any order. |
| Giver and turn-in | Can be two different NPCs (a delivery or "go and talk to" quest). |
| `give` | Items handed over when the quest is accepted (a letter is a `paper`, a map is a `map`). |
| `collect` is handed in | On turn-in the collected items are removed from the bags. A `collect` of an item that another objective of the same quest uses up (craft it, then collect it) breaks. Avoid it. |
| Prerequisites | `requires: [questIds]`. Status is `locked`, `available`, `active`, `ready` or `done`. |
| Log size | `MAX_ACTIVE = 15` quests at once (12 in the first draft of this design). |
| Rewards | `xp` (class XP), `coins` (default 2 x xp), `items`, `classItems` (the skill book of the player's class). |
| Dialogue | Four texts per quest: `offer`, `progress`, `complete`, `summary`. |
| Zones that exist | `dawnwatch`, `undercroft`, `training_yard`, `hollow_cellar`, `lush_cave`, `dripstone_cave`, `deep_dark` (and `greykeep`, now in the castle world). |

### 1.2 Systems the story can teach (all confirmed in code)

| System | Source file | What the story can use |
|---|---|---|
| Classes | `classes.ts`, `abilities.ts`, `skillbooks.ts` | Warrior, Mage, Ranger. Cap level 20. Class XP to next level = 30 + 20(L-1) + 4(L-1)^2, about 12,400 XP in total. 12 abilities from books: Warrior (ground_slam, shield_bash, charge, iron_defense), Mage (fireball, frost_nova, meteor, arcane_shield), Ranger (piercing_shot, evasive_roll, bear_trap, rain_of_arrows). Books come from monsters, quests and the merchants. |
| Stat points | `statPoints.ts` | Strength, Agility, Vitality, Energy. Points come with every class level. |
| Gathering and tools | `crafting.ts` | Tools in 4 materials, crafting table, furnace, campfire. Anvil, grindstone, enchanting table, bookshelf. |
| Farming | `plantGrowth.ts`, `blocks.ts` | Wheat, potato, carrot, beetroot, melon, pumpkin, cocoa, sweet berries, sugar cane. Seeds are sold. |
| Food and hunger | `crafting.ts`, `smelting.ts`, `campfire.ts` | Bread, cooked meats and fish, stews (mushroom, rabbit, beetroot), baked potato, pumpkin pie, cookie, cake. Food fills hunger. **There is no healing item, no brewing and no potion.** |
| Fishing | `fishing.ts` | Rod, bite window, fish, junk, rare treasure from open water. |
| Villagers | `trading.ts`, `villagerFolk.ts` | 9 professions, 5 levels, emerald trades, in the natural villages. |
| Bed and Emberstone | `emberstone.ts` | Every new character carries an Emberstone (hold right mouse, stand still: it takes you to your bed, or the village). Long rest after use. |
| Map and compass | `crafting.ts` | Craftable. A map is sold by Tobin. |
| Travel | `crafting.ts` | Boat, minecart, rails, powered rails. |
| Mounts | `mounts.ts` | Fenrir horns (4 colours): learned from the horn, summoned with a key, level gated (8 and 14 seen). |
| Companions | `companions.ts`, `crafting.ts` | Cinder Imp (damage +10%) and Dawn Seraph (damage taken -10%), crafted from parts. |
| Wings | `wings.ts`, `crafting.ts` | 6 crafted wings, from a wing frame plus parts plus a Jewel of Dawn; upgrades need a storm feather. |
| Jewels | `jewels.ts` | Dawn (+6, never fails), Rift (to +9), Bloom (an extra stat). Past +9 forged in the crafting grid. |
| Enchanting | `enchant.ts` | Enchanting table, lapis, books, glyphs. |
| Bags | `bags.ts` | Bags 1 to 6, sold by Tobin and Hilda. |
| Economy | `economy.ts` | Coins are carried, not an item. 5 merchants with fixed wares and prices. Selling is allowed. |
| Stash and auction | `stash.ts`, `auction.ts` | Existing NPCs: Stashkeeper Bram and Auctioneer Corvin. |
| Party and guild | `party.ts`, `guild.ts` | Parties for the dungeon; guilds with ranks. |
| Dungeon | `adventure.ts`, `hollowDeep.ts`, `boss.ts` | The Hollow Cellar is the Hollow Deep. Level 5 minimum. Entry uses a Hollow Sigil (Warden Scroll + Hollow Bone, both sold by Tobin). Moss lurkers, spore puffs, ember wraiths, ashen knights, hollow priests, shades, then The Hollow King (3 phases at 70% and 40% health, courts of helpers, announced spells). Warden Hale stands just inside. |
| World events | `rift.ts`, `invasion.ts` | Rifts (waves, last with a warden) and the Gilded Tide (every 30 minutes: gilt imps, hounds, drakes, colossi, King Aurelion, who drop Codexes of Aurelion; a Codex opens into Epic gear). |
| Daily content | `bounties.ts`, `achievements.ts` | Three daily bounties and an achievement list already exist. The story does **not** add daily quests. |
| Mobs | `mobs.ts` | Animals (pig, cow, sheep, chicken, rabbit, llama, horse, wolf, fox, polar bear...), water mobs, zombie, skeleton, creeper, spider, slime, husk, stray, drowned, enderman, and the dungeon and Gilded Tide kinds above. |

### 1.3 What the game does NOT have (so no quest relies on it)

- No poultice, potion, bandage or any healing item. (The old idea of a "poultice" quest is replaced by food and stew.)
- No "talk to", "use item", "interact", "escort", "defend" or timed objective. A talk quest is a delivery (give a letter, hand it in).
- No repeatable quests (the daily bounties cover that).
- No quest-only drops and no quest items. Added as **[T1]** and **[NEW-ITEM]** because you asked for it.
- No quest filter by class. Added as **[T2]**.
- The places of the story outside Dawnwatch are not named zones yet. Added as **[T3]**: each outpost is a made place with its own named zone and its own NPCs (see Part 10).

---

## PART 2 — Premise and mystery

### 2.1 The one-paragraph story

Three hundred years ago the **Rift** tore open. **King Orrin Dawnbringer** and four Warden houses made the **Dawn Seal** from five Embers to hold it shut. Orrin took the last and heaviest duty: he stood at the Rift's heart and burned the Seal into himself. Bearers never last. The fire hollows them. Orrin became **The Hollow King**, and the knights who followed him down became the **Ashen Court**. The Seal now cracks, and the Rift spits out the dead, the drowned and the golden (the Gilded Tide).

You wake in a stranger's bed in **Dawnwatch**, wounded, with no memory, and the only thing on you is an **Emberstone**. Every wanderer who wakes at Dawnwatch carries one, and nobody has ever asked why.

### 2.2 The mystery, in layers (what the player learns, in order)

| Layer | Revealed in | The player learns |
|---|---|---|
| 1 | Act I | The zombies near Dawnwatch wear the Rift's mark, the same mark as on your arm. You were found in a clearing in Whisperwood. |
| 2 | End of Act I | Something under the old cellar is awake. The Hollow King speaks. His seal is cracking. |
| 3 | Act II | The Seal was five Embers. Three are hidden in Reedhollow, Sandmere and Frostgate, and the villages kept them without knowing what they were. |
| 4 | Act III, Highmarket | A bearer must carry the Seal's fire. The records name the **sixth bearer**: a Rift-marked wanderer who went below at the last tear and never came back. |
| 5 | Act III, Greykeep | The Throne Ember sits in the Hollow Deep. King Orrin did not choose to become the King. The Ashen Court is a garrison that never left its post. |
| 6 | Act III, Dawnwatch | Elder Maren knew you from the start. She was the bearer's teacher. She did not tell you because the Seal takes the bearer's memory on the way back. |
| 7 | Act IV | The Seal does not need a bearer. It needs five hands. The player brings the five Embers (Reed, Sand, Frost, Throne, and the Emberstone you carried) to the King's throne. |
| 8 | Epilogue | The Seal holds, but the Rift is greedy. The Gilded Tide is its tithe. The wardens' work is never done: Rifts, the Tide, Aurelion. |

### 2.3 How the story fits the game's own facts

- **The Emberstone** is real: every character has one, and it is the hearthstone. It becomes the fifth Ember.
- **Dawnwatch, the Undercroft, the ruined chapel, the portal, the Hollow Cellar and Warden Hale** all exist. They keep their places.
- **The Hollow King and his three phases** are the story's last fight. Nothing about him is changed.
- **Ashen knights, hollow priests, shades, ember wraiths, moss lurkers and spore puffs** are the Ashen Court's members. The story gives them names, not new stats.
- **The Rift and the Gilded Tide** are the epilogue (Act IV and the endgame lines).
- **Whisperwood** is only the name for the forest around Dawnwatch. It is not a new system.

---

## PART 3 — The world, villages and NPCs

### 3.0 Which world: the World Beyond

The Adventure story is set in **the World Beyond** (110 biomes, ten signature realms, 35 kinds of places, layered caves), with **Dawnwatch and the Hollow Cellar moved onto it from the old handmade map**. It fits better than the old map:

| Need of the story | Old Adventure map | The World Beyond |
|---|---|---|
| Villages in a swamp, a desert and the snow | One biome mix, one hub | Every biome exists, with villages, harbours, tree villages and fishing villages drawn in local materials |
| A castle | Moved out to its own world | Mountain holds, ruined and volcanic fortresses, monasteries, temples |
| A "Hollow King" country | None | The **Ashen Kingdom** realm (hot dry country), the Eternal Night, the Pale Wastes, the Crystal Expanse: the endgame can send the player there |
| Caves for the Embers | Three cave kinds | Caverns, deep and abyssal ecosystems, all connected to the surface |
| Something to find | Little | The Codex (**B**) records biomes, places and deeds as the traveller finds them |

Two limits, and what the design does about them:

1. **Beyond places are scattered by the seed, not where the story needs them.** So every story place is a **made outpost** (like Dawnwatch is today). Each is placed by a deterministic search from the seed, in the biome it needs (a swamp village in a swamp-family biome, and so on). The wild Beyond places between the outposts are free to find; no quest needs one.
2. **Hostile monsters follow the ground block, not the biome** (a known limit in `docs/BEYOND.md`). Quests therefore ask for monsters the game really spawns (zombie, skeleton, spider, creeper, husk, stray, drowned, slime) and for a biome's wildlife, never for a biome-specific monster.

The move itself (Dawnwatch, the Undercroft, the chapel, the portal and the Hollow Cellar copy onto a Beyond generator) is described in Part 10 with its size. The quest data does not depend on how it is done: quests name slots and zones only.

Settlements are called **slots**, so you can move or rebuild any of them (you said you will change the town and the castle) without rewriting quests. Every quest names the slot, not coordinates.

| Slot | Place | Kind | Levels | Status |
|---|---|---|---|---|
| DW | **Dawnwatch** | Starting village and hub | 1 to 10 | Exists |
| WW | **Whisperwood** (and the Clearing where you were found) | Forest, wilderness | 1 to 5 | Name only; Clearing is **[NEW-ZONE]** |
| HC | **Ruined chapel and the Hollow Cellar** | Dungeon | 5 to 20 | Exists |
| RH | **Reedhollow** | Swamp village outpost | 6 to 8 | Made outpost in a swamp-family biome **[T3]** |
| SM | **Sandmere** | Desert village outpost | 8 to 10 | Made outpost in a desert-family biome **[T3]** |
| FG | **Frostgate** | Snow village outpost | 9 to 11 | Made outpost in a snow-family biome **[T3]** |
| HM | **Highmarket** | Walled town (the "town") | 11 to 13 | Made outpost on open plains; the village generator already makes walled villages **[T3]** |
| GK | **Greykeep** | Castle | 13 to 16 | Made outpost on a rise, built from `castle.ts` (now used by the castle world) **[T3]** |

### 3.1 Roster

**Existing NPCs (13).** Names, titles and the places in the table are from `NPCS` in the code.

| ID | Name | Role | Quest role |
|---|---|---|---|
| maren | Elder Maren | Village Elder | Main-story guide. Hides that she knew you. |
| brannoc | Smith Brannoc | Master Craftsman | Crafting, mining, smelting. |
| isolde | Ranger Isolde | Warden of the Wilds | Wilderness, hunting, exploring. |
| varro | Captain Varro | Captain of the Watch | Combat, dungeon prep. |
| tobin | Merchant Tobin | General goods | Trade, food, bags, map, sigil parts. |
| hilda | Hilda Ironwall | Armorer | Armor and jewellery. |
| garrick | Garrick Bladesworn | Weaponsmith | Warrior class line. |
| fenna | Fenna Longbow | Ranger Quartermaster | Ranger class line, mount horns. |
| lysa | Lysa Moonweaver | Arcanist | Mage class line. |
| mirel | Healer Mirel | Keeper of the Undercroft | Lore, the bed and the Emberstone. |
| auctioneer | Auctioneer Corvin | Auction House | Market quest. |
| stashkeeper | Stashkeeper Bram | The Stash | Storage quest. |
| hale | Warden Hale | Warden of the Hollow Cellar | Dungeon quests. |

**New NPCs (13).** They are plain NPC records plus a look **[NEW-NPC]**.

| ID | Name | Where | Role |
|---|---|---|---|
| wick | Farmer Wick | DW farm plots | Farming chain. |
| nell | Nell Hearthwood | DW inn | Cooking, beds, food. |
| ilse | Sister Ilse | DW, by the road to the chapel | Lore, Seal history. |
| tamsin | Headwoman Tamsin | RH | Reedhollow arc. |
| dunstan | Dunstan the Fisher | RH | Fishing quests. |
| idris | Caravan-master Idris | SM | Sandmere arc, trader llamas. |
| oska | Delver Oska | SM | Mining, caves. |
| halvard | Warden Halvard | FG | Frostgate arc. |
| sigrun | Hunter Sigrun | FG | Hunting, pelts. |
| thessaly | Burgomaster Thessaly | HM | Town leader, records of the Wardens. |
| vael | Enchantress Vael | HM | Enchanting and jewels. |
| ivo | Skywright Ivo | HM | Wings. |
| aldren | Castellan Aldren | GK | Castle arc and the Throne Ember. |

(13 new NPCs on top of the 13 that exist: 26 in all.)

---

## PART 4 — Progression map

Class level is the level that matters (cap 20). Times are for a solo player who does the main line and about half the side quests.

| Act | Levels | Place | Time | Theme | What the player learns |
|---|---|---|---|---|---|
| I Waking | 1 to 5 | Dawnwatch, Whisperwood, Undercroft, Hollow Cellar door | about 1.5 h | "Who am I and what is under the village?" | Move, mine, craft, place, cook, hunger, combat, night, beds and the Emberstone, shops and coins, smelting, bags, first dungeon. |
| II Three Embers | 5 to 10 | Reedhollow, Sandmere, Frostgate | about 3 h | "Find the Seal's Embers." | Boats, fishing, farming, caves and zones, trading with villagers, class abilities, mounts, travel between villages, quest items. |
| III The Records | 10 to 15 | Highmarket, Greykeep, Dawnwatch | about 3 h | "Who was the sixth bearer?" | Auction and stash, enchanting, jewels, armor tiers, party, guild, the castle. The twist. |
| IV The Hollow Deep | 15 to 20 | Hollow Cellar (all of it) | about 2.5 h | "Bring five hands to the Seal." | The full dungeon, boss mechanics (phases, casts, courts), parties. |
| Endgame | 15 to 20 and past | Everywhere | open | "The wardens' work" | Wings, companions, mounts, Gilded Tide, Rifts, Aurelion, jewels past +9. |

Quest count: **134** in all, 39 main (`ms00` to `ms38`) and 95 side (Part 6). The class lines, the farming, cooking and exploration chains and the endgame chains fall inside the sides.

### 4.1 What a new player can take at the same time

At the end of the first quest (Lv 1) four NPCs have quests ready. By Lv 3, nine NPCs. The log holds 12, so the player always has a choice (and is never forced to take more than they want).

| After | Available at once |
|---|---|
| ms01 | Maren (ms02), Tobin (2), Nell (1), Wick (1) |
| ms04 | Brannoc (2), Isolde (2), Varro (2), Hilda (1), Garrick (1), Fenna (1), Lysa (1) and class line starters |
| ms10 | Hale (2), Mirel (2), Ilse (2), Corvin (1), Bram (1), plus the road to Reedhollow |

---

## AS BUILT — where the game differs from the design above

The quests are in `packages/shared/src/storyQuests.ts` (data), `questDrops.ts` (quest items that drop only while their quest is active) and `quests.ts` (the engine, the NPCs, the zones). The world is `adventure.ts` and `outposts.ts`.

- **The world.** The Adventure now runs on the World Beyond (`AdventureWorldGenerator extends BeyondWorldGenerator`, seed `ADVENTURE_SEED = 2036`, land slid by `ADVENTURE_OFFSET_X/Z`). Dawnwatch, the Undercroft, the chapel and the Hollow Cellar are the same made places on the new land.
- **Outposts** (distances from Dawnwatch's middle, see `OUTPOSTS`): Reedhollow (184, 49), Sandmere (-219, 219), Frostgate (191, -191), Highmarket (0, 190, walled, with the village wall builder) and Greykeep (247, 247: the castle of `castle.ts` behind a bridge, drawn shifted by `GREYKEEP_SHIFT_Z`). Each has its own named zone, a levelled and protected square, no monsters, and its people stand on the plaza (`NpcDef.place`, with x and z measured from the plaza).
- **The three Embers are in vaults, not caves.** The Beyond has no lush, dripstone or deep-dark caves, so each Ember lies in a built chamber under a levelled square near its village (`VAULTS`): the Reed Grotto (flooded), the Sand Crypt and the Frost Vault. A ramp goes down; two cages (spawners, `spawnerAt`) keep making the vault's monsters while someone is near, so the drop (12%, a guaranteed one after 15 misses) can always be earned. The zone ids are `reed_grotto`, `sand_crypt` and `frost_vault`.
- **The Clearing** where the hunters found you (`whisper_clearing`) is a ring of mossy stones round a cold fire pit at (-76, -60); the chapel road ends in the `chapel_ruin` zone.
- **Ashbrook, the start.** A new character does not wake in Dawnwatch but in the Undercroft under **Ashbrook**, a small village at (-150, 64) (first entry of `OUTPOSTS`, `ADVENTURE_LAYOUT` 14). The cave, the stair and the cellar house are drawn round `UNDERCROFT_ORIGIN`; Ashbrook has a plaza with a waystone, the reeve's hall, a smithy, an inn, a cottage, a farm and the green (`ASHBROOK_GREEN`), where deaths and creative characters arrive (`spawnFor`). Dawnwatch is the big walled city, reached by a gravel road from Ashbrook's street east and north to its west gate; its own Landing (`landingFor`) stays as a paved square nobody is born on.
- **Who stands where.** Ashbrook: Reeve Edda (new; she gives `ms01`, `ms02`, `ms05` and takes in `ms00`), Healer Mirel, Smith Brannoc, Ranger Isolde (she now gives `ms04`), Nell and Farmer Wick. Dawnwatch keeps Elder Maren, Captain Varro, the merchants, the Auctioneer, the Stashkeeper and Sister Ilse.
- **The trip to the city.** `ms08` (Iron in the Blood) starts with Brannoc but is handed in to Elder Maren in Dawnwatch: its last objective is to reach the `dawnwatch` zone, and the Sigil Fee (`ms09`) requires it. Everything later that sends you back to Maren (`ms11`, the Ember hand-ins) already points at Dawnwatch.
- **Workshops and stashes in every place.** Dawnwatch and all six outposts have a workshop (WORKSHOPS in outposts.ts, built by workshop() in dventure.ts): a roofed row of four crafting tables and four furnaces, so that many players at once never need to place their own (furnace state is per block, hence four). No quest asks to craft or place a table or a furnace (quests.test.ts checks it); ms01 asks for planks and sticks from the 2x2 grid, ms03 only to cook. Each place also has a stashkeeper (NpcDef.stash, isStashkeeper in stash.ts: Bram in Dawnwatch, Cellarer Odo, Netkeeper Brin, Warehouser Zahir, Tallyman Ketil, Vaultkeeper Orsolya and Quartermaster Hadrian), all opening the same wallet stash.
- **Opening.** The first quest (`ms00`) pays the map, the Emberstone, bread and torches. The class kit comes at `ms02`.
- **Embers are handed back.** The quests that ask for an Ember return it in the reward (`ms15`, `ms19`, `ms23`, and the Throne Ember at `ms37`), so the next quest can ask for it again.
- **Biggest bag.** `ms38` gives bag 5.
- **Quest items** are `I.*` ids 600 to 616 (`undroppable`, never sold, never dropped by the player).
