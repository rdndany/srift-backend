# PART 6 — Side quests and class lines (95 quests)

Compact format. Every quest has the same fields as Part 5; the ones that never change are written once here.

```
id · Name · Lv · tier (xp) · Giver -> Turn-in · Requires
Do      objectives with their trigger kinds
Say     the offer line (the complete line is "Well done" unless one is written)
Reward  items; xp and coins follow the tier (coins: S x2, C x3) unless a number is given
```

- **Category** is the section title. **Duration** is 5 to 15 minutes unless written. **Variants:** none unless written. **Failure and recovery, Next and Tech notes** follow the global rules of Part 5; only a `[tag]` is written when a quest needs one.
- XP tiers: **S** side 6%, **C** class 12%, of the class XP for the level (Part 11 has the value table). S values: Lv 1 = 2, 2 = 3, 3 = 5, 4 = 8, 5 = 10, 6 = 14, 7 = 18, 8 = 22, 9 = 27, 10 = 32, 11 = 38, 12 = 44, 13 = 51, 14 = 58, 15 = 66, 16 = 74, 17 = 82, 18 = 92, 19 = 101.
- A quest that says `Requires: ms04` can be taken as soon as that main quest is done.
- Quest items (`QI13` to `QI17`) are in Part 7.

---

## A. Dawnwatch (38 quests, Lv 1 to 10)

### Merchant Tobin (trade)
- **dw_tobin_1 · Sell What You Dragged Out** · Lv 2 · S (3) · Tobin -> Tobin · ms01
  Do: collect 6 bones and 4 string `[collect]`. Say: *"Bones and string. Always short of both."* Reward: 2 bread.
- **dw_tobin_2 · A Full Larder** · Lv 3 · S (5) · Tobin -> Tobin · ms01
  Do: collect 6 sweet berries and 4 apples `[collect]`. Say: *"Forest food, please. My customers will not touch my own cooking."* Reward: 1 mushroom stew.
- **dw_tobin_3 · Light for the Road** · Lv 4 · S (8) · Tobin -> Tobin · ms02
  Do: craft 16 torches `[craft]`; place 8 torches `[place]`. Say: *"Light is the cheapest armour there is."* Reward: bag 1 (if the player has none).
- **dw_tobin_4 · The Heavy Bag** · Lv 6 · S (14) · Tobin -> Tobin · ms08
  Do: craft a bag `[craft]`; collect 12 leather `[collect]`. Say: *"A good bag is a second pair of hands."* Reward: 12 bread.

### Hilda Ironwall (armor)
- **dw_hilda_1 · A Full Set of Leather** · Lv 3 · S (5) · Hilda -> Hilda · ms04
  Do: craft a leather helmet, chestplate, leggings and boots `[craft]` (4 objectives). Say: *"Wear all four pieces. Half a set is half a life."* Reward: a gold ring.
- **dw_hilda_2 · Iron Resolve** · Lv 7 · S (18) · Hilda -> Hilda · dw_hilda_1
  Do: craft a full iron set `[craft]` (4 objectives). Say: *"Now you look like someone who intends to come back."* Reward: a gold necklace.

### Garrick Bladesworn (weapons)
- **dw_garrick_1 · The Dummy Never Dodges** · Lv 2 · S (3) · Garrick -> Garrick · ms01
  Do: enter the Training Yard `[enter]`; craft a sword `[craft]`. Say: *"Hit the dummy until your arm shakes. It does not complain."* Reward: 12 arrows.
- **dw_garrick_2 · Sharp as a Promise** · Lv 10 · S (32) · Garrick -> Garrick · ms08
  Do: craft a grindstone and an anvil `[craft]`; place both `[place]`. Say: *"A blade you do not look after is a stick."* Reward: a Jewel of Dawn.

### Fenna Longbow (ranger quartermaster)
- **dw_fenna_1 · A Quiver Full** · Lv 3 · S (5) · Fenna -> Fenna · ms01
  Do: craft a bow `[craft]`; craft 32 arrows `[craft]`. Say: *"A ranger without arrows is a hiker."* Reward: 24 arrows.
- **dw_fenna_2 · Fletching** · Lv 6 · S (14) · Fenna -> Fenna · dw_fenna_1
  Do: collect 12 feathers and 12 flint `[collect]` (kill chickens, dig gravel); craft 24 arrows `[craft]`. Say: *"Feathers from chickens, flint from gravel. Be patient with both."* Reward: 1 crossbow.

### Lysa Moonweaver (arcanist)
- **dw_lysa_1 · Ink and Paper** · Lv 3 · S (5) · Lysa -> Lysa · ms01
  Do: collect 6 paper `[collect]` (craft from sugar cane); craft a book `[craft]`. Say: *"Every spell begins as a page."* Reward: 6 lapis lazuli.
- **dw_lysa_2 · Glow of the Deep** · Lv 7 · S (18) · Lysa -> Lysa · dw_lysa_1
  Do: mine 6 lapis ore `[mine]`; collect 8 glow berries `[collect]`. Say: *"Lapis and glow berries, from the deep caves. Take a torch and a friend."* Reward: a bookshelf.

### Smith Brannoc (crafting)
- **dw_brannoc_1 · Cobble to Brick** · Lv 3 · S (5) · Brannoc -> Brannoc · ms02
  Do: smelt 8 cobblestone into stone `[smelt]`; craft 8 stone bricks `[craft]`. Say: *"Rough stone for beginners, bricks for builders."* Reward: 16 torches.
- **dw_brannoc_2 · Glass for the Chapel** · Lv 5 · S (10) · Brannoc -> Brannoc · dw_brannoc_1
  Do: smelt 12 sand `[smelt]`; collect 12 glass `[collect]`. Say: *"The chapel has no windows. Sand and a fire."* Reward: 1 lantern.
- **dw_brannoc_3 · A Shield for the Watch** · Lv 6 · S (14) · Brannoc -> Varro · ms08
  Do: craft 2 shields `[craft]` (a delivery to Varro). Say: *"Varro's watch is running short."* Reward: coins (+30).
- **dw_brannoc_4 · The Rail Line** · Lv 9 · S (27) · Brannoc -> Brannoc · ms08
  Do: craft 16 rails and a minecart `[craft]`; place 12 rails `[place]`. Say: *"Hauling ore by hand is for the young."* Reward: 8 powered rails.

### Ranger Isolde (wilds)
- **dw_isolde_1 · Night Watch** · Lv 4 · S (8) · Isolde -> Isolde · ms04
  Do: kill 4 spiders `[kill]`; kill 4 skeletons `[kill]`. Say: *"The night has more than zombies. Learn them all."* Reward: 24 arrows.
- **dw_isolde_2 · The Ranger's Count** · Lv 6 · S (14) · Isolde -> Isolde · dw_isolde_1
  Do: kill 3 creepers `[kill]`; collect 6 gunpowder `[collect]`. Say: *"Never fight one at close range. Never. I mean it."* Reward: 1 flint and steel.

### Captain Varro (the Watch)
- **dw_varro_1 · Watchman for a Night** · Lv 3 · S (5) · Varro -> Varro · ms04
  Do: kill 10 zombies `[kill]`. Say: *"Stand on the wall and count. I will pay you in coin."* Reward: 1 shield.
- **dw_varro_2 · Spider Season** · Lv 5 · S (10) · Varro -> Varro · ms04
  Do: kill 8 spiders `[kill]`; collect 6 string and 4 spider eyes `[collect]`. Say: *"They come in autumn. Bring me the eyes; the apothecary counts them."* Reward: 4 cooked meat.
- **dw_varro_3 · Burned Fields** · Lv 8 · S (22) · Varro -> Varro · dw_varro_2
  Do: collect 5 Scorched Fuses (QI13) `[collect]` `[T1]`. Items: QI13 drops from creepers while active, 30% each. Say: *"Somebody burned the east fields. I want the fuse ends. They tell me what burned them."* Reward: iron axe.

### Elder Maren
- **dw_maren_1 · Bread for the Bell** · Lv 4 · S (8) · Maren -> Maren · ms01
  Do: collect 8 bread `[collect]`. Say: *"The bell-ringer is old and hungry. Feed him and he will ring it right."* Reward: 1 cake.
- **dw_maren_2 · The Old Hearth** · Lv 10 · S (32) · Maren -> Maren · ms24
  Do: craft 2 campfires `[craft]`; place 2 `[place]`. Say: *"Light the old hearth in the square. It has been dark since Orrin."* Reward: 12 bread.

### Healer Mirel
- **dw_mirel_1 · Cobwebs in the Undercroft** · Lv 3 · S (5) · Mirel -> Mirel · ms05
  Do: mine 8 cobwebs `[mine]`; collect 4 string `[collect]`. Say: *"The old storm cellars are choked with webs. Take shears."* Reward: 1 pair of shears.
- **dw_mirel_2 · Lanterns for the Dead** · Lv 6 · S (14) · Mirel -> Mirel · dw_mirel_1
  Do: craft 4 lanterns `[craft]`; place 4 `[place]`. Say: *"The dead did not ask for much. A little light."* Reward: 1 soul lantern.

### Farmer Wick `[NEW-NPC]` (farming)
- **dw_wick_1 · Dirt Under the Nails** · Lv 1 · S (2) · Wick -> Wick · ms01
  Do: craft a hoe `[craft]`; collect 6 wheat seeds `[collect]` (break tall grass). Say: *"Seeds are in the grass for anybody who looks."* Reward: 4 bread.
- **dw_wick_2 · First Harvest** · Lv 2 · S (3) · Wick -> Wick · dw_wick_1
  Do: place 6 wheat seeds on farmland `[place]`; collect 12 wheat `[collect]`. Say: *"Water nearby. Patience. Then the sickle."* Reward: 8 bread.
- **dw_wick_3 · The Root Cellar** · Lv 4 · S (8) · Wick -> Wick · dw_wick_2
  Do: collect 10 potatoes and 10 carrots `[collect]`; smelt 6 baked potatoes `[smelt]`. Say: *"Roots keep through winter."* Reward: 1 bag 1 (if the player has none), else 6 baked potatoes.
- **dw_wick_4 · The Pumpkin Patch** · Lv 6 · S (14) · Wick -> Wick · dw_wick_3
  Do: collect 4 pumpkins and 4 melons `[collect]`; craft 2 pumpkin pies and 1 cake `[craft]`. Say: *"Pie for the Elder, cake for the child."* Reward: 1 shears.

### Nell Hearthwood `[NEW-NPC]` (cooking)
- **dw_nell_1 · Stew for Seven** · Lv 2 · S (3) · Nell -> Nell · ms03
  Do: collect 4 mushrooms `[collect]`; craft 4 mushroom stews `[craft]`. Say: *"Brown and red. Never the pale ones."* Reward: 2 mushroom stew.
- **dw_nell_2 · Sweet Tooth** · Lv 4 · S (8) · Nell -> Nell · dw_nell_1
  Do: collect 6 cocoa beans `[collect]`; craft 6 cookies `[craft]`. Say: *"The child has not smiled in a week."* Reward: 1 cake.
- **dw_nell_3 · Rabbit for the Road** · Lv 7 · S (18) · Nell -> Nell · dw_nell_2
  Do: kill 4 rabbits `[kill]`; craft 3 rabbit stews `[craft]`. Say: *"A stew that travels well."* Reward: 3 rabbit stew.

### Sister Ilse `[NEW-NPC]` (the Seal's history)
- **dw_ilse_1 · Flowers for the Road** · Lv 5 · S (10) · Ilse -> Ilse · ms04
  Do: place 4 roses and 4 dandelions `[place]`. Say: *"The road to the chapel is bleak. Make it less so."* Reward: 12 torches.
- **dw_ilse_2 · A Warden's Grave** · Lv 9 · S (27) · Ilse -> Ilse · ms10
  Do: collect 8 bones `[collect]`; place 4 flowers (any) `[place]`. Say: *"Orrin's wardens lie in the chapel yard. Honour them."* Reward: 4 lapis lazuli.

### Warden Hale (the dungeon, needs a Hollow Sigil)
- **dw_hale_1 · Spore Samples** · Lv 6 · S (14) · Hale -> Hale · ms10
  Do: kill 5 spore puffs `[kill]`; collect 3 Spore Jars (QI15) `[collect]` `[T1]`. Items: QI15 drops from spore puffs while active, 40% each. Say: *"The spores stick to everything. Bring me jars so that I can count them."* Reward: 1 Hollow Sigil.
- **dw_hale_2 · Moss for the Wounded** · Lv 8 · S (22) · Hale -> Hale · dw_hale_1
  Do: kill 6 moss lurkers `[kill]`; collect 8 moss blocks `[collect]`. Say: *"Moss is the only dressing we have. Do not ask."* Reward: 1 Hollow Sigil.

### Auctioneer Corvin and Stashkeeper Bram
- **dw_corvin_1 · Putting Up a Price** · Lv 6 · S (14) · Corvin -> Corvin · ms08
  Do: collect 4 cooked meat and 1 emerald `[collect]` (a sample lot). Say: *"Everything has a price. Learn the board."* Reward: 60 coins.
- **dw_bram_1 · A Place for Everything** · Lv 4 · S (8) · Bram -> Bram · ms08
  Do: craft 2 chests `[craft]`; place 2 `[place]`. Say: *"What you cannot carry you can keep in the Stash. What you cannot keep, you can sell."* Reward: bag 2 (if the player has none).

---

## B. Reedhollow (5 quests, Lv 6 to 8)

- **rh_tamsin_1 · Slime in the Well** · Lv 6 · S (14) · Tamsin -> Tamsin · ms12
  Do: kill 10 slimes `[kill]`; collect 6 slimeballs `[collect]`. Say: *"Something green is in our water."* Reward: 8 bread.
- **rh_tamsin_2 · Reed Roofs** · Lv 7 · S (18) · Tamsin -> Tamsin · ms12
  Do: collect 16 sugar cane `[collect]`; craft 8 paper `[craft]`. Say: *"The roofs leak, the ink runs, the children cry."* Reward: 1 map.
- **rh_tamsin_3 · Lanterns on the Water** · Lv 8 · S (22) · Tamsin -> Tamsin · rh_tamsin_2
  Do: place 8 lanterns `[place]`. Say: *"On the night of the drowned we float lights."* Reward: 1 boat.
- **rh_dunstan_1 · The Big One** · Lv 7 · S (18) · Dunstan -> Dunstan · ms14
  Do: collect 4 raw salmon `[collect]` (fishing). Say: *"There is a salmon in the deep pool as long as my arm."* Reward: 1 fishing rod.
- **rh_dunstan_2 · Pufferfish Warning** · Lv 8 · S (22) · Dunstan -> Dunstan · rh_dunstan_1
  Do: collect 3 pufferfish `[collect]`. Say: *"Do not eat them. Do not let the child near them. I want them out of the nets."* Reward: 12 bread.

## C. Sandmere (5 quests, Lv 8 to 9)

- **sm_idris_1 · Sand and Glass** · Lv 8 · S (22) · Idris -> Idris · ms16
  Do: smelt 16 sand `[smelt]`; collect 16 glass `[collect]`. Say: *"Glass sells in every market from here to the sea."* Reward: coins (+60).
- **sm_idris_2 · The Missing Camel** · Lv 9 · S (27) · Idris -> Idris · sm_idris_1
  Do: kill 4 husks `[kill]`; collect 4 leather `[collect]`. Say: *"Some say my camel was taken by the dust. I say it was a thief."* Reward: iron pickaxe.
- **sm_oska_1 · Red Stone Delve** · Lv 8 · S (22) · Oska -> Oska · ms16
  Do: mine 10 redstone ore `[mine]`. Say: *"Red dust lights the lamps and opens the doors."* Reward: coins (+60).
- **sm_oska_2 · Gold in the Bones** · Lv 9 · S (27) · Oska -> Oska · sm_oska_1
  Do: mine 6 gold ore `[mine]`; smelt 6 gold ingots `[smelt]`. Say: *"Gold is the only thing the dead leave behind."* Reward: gold ring.
- **sm_oska_3 · Nest of Eight Legs** · Lv 9 · S (27) · Oska -> Oska · sm_oska_1
  Do: kill 8 spiders `[kill]`; collect 8 string `[collect]`. Say: *"They have taken the old shaft."* Reward: 4 cooked mutton.

## D. Frostgate (5 quests, Lv 10 to 11)

- **fg_halvard_1 · Spruce for the Wall** · Lv 10 · S (32) · Halvard -> Halvard · ms20
  Do: mine 24 spruce logs `[mine]`; craft 24 fences `[craft]`. Say: *"The wall must be higher than the drifts."* Reward: 2 mushroom stew.
- **fg_halvard_2 · Warm Hearts** · Lv 10 · S (32) · Halvard -> Halvard · fg_halvard_1
  Do: craft 4 campfires `[craft]`; place 4 `[place]`. Say: *"We are cold in the middle of the square."* Reward: 12 bread.
- **fg_sigrun_1 · Wolf Count** · Lv 10 · S (32) · Sigrun -> Sigrun · ms20
  Do: kill 6 wolves `[kill]`. Say: *"More every year."* Reward: 24 arrows.
- **fg_sigrun_2 · Fish Under the Ice** · Lv 11 · S (38) · Sigrun -> Sigrun · fg_sigrun_1
  Do: collect 6 raw salmon `[collect]` (fishing); smelt 6 `[smelt]`. Say: *"Winter fish are the best, if you can stand the wait."* Reward: 1 fishing rod.
- **fg_sigrun_3 · The Bear of the Pass** · Lv 11 · S (38) · Sigrun -> Sigrun · fg_sigrun_2
  Do: kill 1 polar bear `[kill]`; collect 1 Bear Claw (QI16) `[collect]` `[T1]`. Items: QI16 drops from polar bears while active, 100%. Say: *"It has taken two of my dogs. I want a claw to show them."* Reward: a diamond.

## E. Highmarket (6 quests, Lv 11 to 13)

- **hm_thessaly_1 · Trade Winds** · Lv 11 · S (38) · Thessaly -> Thessaly · ms25
  Do: collect 6 emeralds `[collect]` (trade with a villager). Say: *"The market is the heart. Trade, and the heart beats."* Reward: 1 bag 4.
- **hm_thessaly_2 · The Toll Road** · Lv 12 · S (44) · Thessaly -> Thessaly · hm_thessaly_1
  Do: mine 4 emerald ore `[mine]`. Say: *"The caravans pay in emeralds. The mine is dry. Dig."* Reward: 2 Jewels of Dawn.
- **hm_vael_1 · Bottled Experience** · Lv 12 · S (44) · Vael -> Vael · ms28
  Do: collect 12 lapis lazuli `[collect]`; collect 1 book `[collect]`. Say: *"Lapis is half of every enchantment."* Reward: coins (+90).
- **hm_vael_2 · The Fifth Pillar** · Lv 13 · S (51) · Vael -> Vael · hm_vael_1
  Do: craft 2 bookshelves `[craft]`; place them beside the enchanting table `[place]`. Say: *"Shelves make the table strong."* Reward: 1 Jewel of Bloom.
- **hm_vael_3 · A Piece to Raise** · Lv 13 · S (51) · Vael -> Vael · hm_vael_2
  Do: collect 3 Jewels of Dawn `[collect]` (they are handed over for the lesson). Say: *"Show me you know when to stop."* Reward: 1 Jewel of the Rift.
- **hm_trade_1 · The Journeyman's Bargain** · Lv 12 · S (44) · Thessaly -> Thessaly · hm_thessaly_1
  Do: collect 4 books and 4 papers `[collect]`. Say: *"The library will pay well."* Reward: 150 coins.

## F. Greykeep (4 quests, Lv 13 to 16)

- **gk_aldren_1 · The Sealed Coffer** · Lv 13 · S (51) · Aldren -> Aldren · ms29
  Do: collect 1 Sealed Coffer (QI14) `[collect]` `[T1]`. Items: QI14 drops from skeletons and zombies while active, 25% each. Say: *"A box the caravan was paid to bring me, three hundred years late. It must be with the dead."* Reward: 1 Jewel of Dawn. (This pays off ms17.)
- **gk_aldren_2 · Stones of the Wall** · Lv 14 · S (58) · Aldren -> Aldren · ms29
  Do: mine 32 stone `[mine]`; craft 32 stone bricks `[craft]`. Say: *"The wall has gaps. I like to think I know why."* Reward: iron chestplate.
- **gk_aldren_3 · Water in the Moat** · Lv 15 · S (66) · Aldren -> Aldren · gk_aldren_2
  Do: collect 4 water buckets `[collect]`; pour the 4 buckets out as water `[place]`. Say: *"A moat with no water is a ditch."* Reward: diamond.
- **gk_aldren_4 · The Garrison Eats** · Lv 16 · S (74) · Aldren -> Aldren · gk_aldren_3
  Do: collect 16 cooked chicken `[collect]`. Say: *"The garrison is large and likes second helpings."* Reward: 1 Black Fenrir horn (if the player has no second mount).

---

## G. Class lines `[T2]` (15 quests)

The class gate means the quest is only offered to the class named. Each line is five quests; four of them give the class's four ability books (the books can also be bought or found, this line is the story path to them).

### Warrior, Garrick Bladesworn
- **cl_w1 · Oath of the Blade** · Lv 3 · C (10) · Garrick -> Garrick · ms01
  Do: craft a greatsword `[craft]`; enter the Training Yard `[enter]`. Reward: skill book **Ground Slam** `(classItems)`.
- **cl_w2 · Shield Wall** · Lv 6 · C (28) · Garrick -> Garrick · cl_w1
  Do: craft a shield `[craft]`; kill 12 zombies `[kill]`. Reward: skill book **Shield Bash**.
- **cl_w3 · The Charge** · Lv 9 · C (54) · Garrick -> Garrick · cl_w2
  Do: kill 10 skeletons `[kill]`; mine 12 iron ore `[mine]`. Reward: skill book **Charge**.
- **cl_w4 · Unbroken** · Lv 12 · C (88) · Garrick -> Garrick · cl_w3
  Do: craft a full iron set `[craft]`; kill 8 ashen knights `[kill]`. Reward: skill book **Iron Defense**.
- **cl_w5 · Master at Arms** · Lv 16 · C (148) · Garrick -> Garrick · cl_w4
  Do: collect 3 diamonds `[collect]`; craft an anvil `[craft]`. Reward: an Epic class weapon (a Codex of Aurelion), a Jewel of the Rift.

### Mage, Lysa Moonweaver
- **cl_m1 · The First Spark** · Lv 3 · C (10) · Lysa -> Lysa · ms01
  Do: craft a spellbook or wand `[craft]`; enter the Training Yard `[enter]`. Reward: skill book **Fireball**.
- **cl_m2 · Frostbite** · Lv 6 · C (28) · Lysa -> Lysa · cl_m1
  Do: mine 8 snow `[mine]`; kill 8 strays `[kill]`. Reward: skill book **Frost Nova**.
- **cl_m3 · Falling Star** · Lv 9 · C (54) · Lysa -> Lysa · cl_m2
  Do: mine 6 gold ore `[mine]`; collect 6 redstone `[collect]`; kill 6 husks `[kill]`. Reward: skill book **Meteor**.
- **cl_m4 · Ward of Light** · Lv 12 · C (88) · Lysa -> Lysa · cl_m3
  Do: craft an enchanting table `[craft]`; collect 12 lapis lazuli `[collect]`. Reward: skill book **Arcane Shield**.
- **cl_m5 · The Archmage's Trial** · Lv 16 · C (148) · Lysa -> Lysa · cl_m4
  Do: kill 6 hollow priests `[kill]`; collect 3 diamonds `[collect]`. Reward: an Epic class weapon (a Codex of Aurelion), a Jewel of the Rift.

### Ranger, Fenna Longbow
- **cl_r1 · A Steady Hand** · Lv 3 · C (10) · Fenna -> Fenna · ms01
  Do: craft a bow `[craft]`; enter the Training Yard `[enter]`. Reward: skill book **Piercing Shot**.
- **cl_r2 · Roll With It** · Lv 6 · C (28) · Fenna -> Fenna · cl_r1
  Do: kill 6 spiders `[kill]`; collect 6 string `[collect]`. Reward: skill book **Evasive Roll**.
- **cl_r3 · Snares and Traps** · Lv 9 · C (54) · Fenna -> Fenna · cl_r2
  Do: kill 4 foxes `[kill]`; kill 4 wolves `[kill]`. Reward: skill book **Bear Trap**.
- **cl_r4 · Rain of Arrows** · Lv 12 · C (88) · Fenna -> Fenna · cl_r3
  Do: craft 64 arrows `[craft]`; kill 10 skeletons `[kill]`. Reward: skill book **Rain of Arrows**.
- **cl_r5 · Warden of the Wilds** · Lv 16 · C (148) · Fenna -> Fenna · cl_r4
  Do: kill 6 shades `[kill]`; collect 3 diamonds `[collect]`. Reward: an Epic class weapon (a Codex of Aurelion), a Jewel of the Rift.

---

## H. The Wayfarer's Ledger (6 quests, Ranger Isolde)

A short chain that sends the player to the places the game names. All use `enter` and `place`; nothing else.

- **ex_1 · The First Cave** · Lv 4 · S (8) · Isolde -> Isolde · ms04
  Do: enter the Lush Cave `[enter]`. Say: *"Moss and berries. Easy, if you light your way."* Reward: 12 torches.
- **ex_2 · Dripping Stone** · Lv 6 · S (14) · Isolde -> Isolde · ex_1
  Do: enter the Dripstone Cave `[enter]`. Say: *"Watch your head."* Reward: 1 map.
- **ex_3 · The Deep Dark** · Lv 9 · S (27) · Isolde -> Isolde · ex_2
  Do: enter the Deep Dark `[enter]`. Say: *"Nothing grows there. Nothing should."* Reward: 1 compass.
- **ex_4 · The Villages on the Map** · Lv 8 · S (22) · Isolde -> Isolde · ms16
  Do: enter Reedhollow, Sandmere and Frostgate `[enter]` (3 objectives). Say: *"Walk the road once, and you will never be lost."* Reward: 1 boat.
- **ex_5 · Cairn Builder** · Lv 5 · S (10) · Isolde -> Isolde · ex_1
  Do: place 16 cobblestone `[place]`. Say: *"A cairn marks the way for the next one."* Reward: 12 torches.
- **ex_6 · The Far Country** · Lv 15 · S (66) · Isolde -> Isolde · ms32
  Do: enter 3 named Beyond realms or places (any three from the Codex) `[enter]` `[T3]`. Say: *"There is a whole world past the villages."* Reward: diamond.

---

## I. Endgame lines (11 quests, Lv 14 to 20)

### Wings, Skywright Ivo `[NEW-NPC]`
- **eg_wing_1 · Gladewings** · Lv 14 · S (58) · Ivo -> Ivo · ms28
  Do: craft a wing frame `[craft]`; craft the Gladewings `[craft]`. Items: `give` 1 Jewel of Dawn. Reward: coins (+120).
- **eg_wing_2 · Cinderwings** · Lv 16 · S (74) · Ivo -> Ivo · eg_wing_1
  Do: craft 6 imp horns `[craft]`; craft the Cinderwings `[craft]`. Items: `give` 1 Jewel of Dawn.
- **eg_wing_3 · Skywings** · Lv 18 · S (92) · Ivo -> Ivo · eg_wing_2
  Do: craft 4 seraph feathers `[craft]`; craft the Skywings `[craft]`. Items: `give` 1 Jewel of Dawn.
- **eg_wing_4 · The Storm Feather** · Lv 19 · S (101) · Ivo -> Ivo · eg_wing_3
  Do: craft a storm feather `[craft]`; craft one upgraded wing `[craft]`. Items: `give` 1 Jewel of the Rift.

### Companions, Enchantress Vael
- **eg_comp_1 · Cinder at Your Shoulder** · Lv 15 · S (66) · Vael -> Vael · ms28
  Do: craft a cinder heart `[craft]`; craft the Cinder Imp `[craft]`. Items: `give` 1 Jewel of the Rift.
- **eg_comp_2 · Dawn at Your Shoulder** · Lv 16 · S (74) · Vael -> Vael · eg_comp_1
  Do: craft a halo ring `[craft]`; craft the Dawn Seraph `[craft]`. Items: `give` 1 Jewel of Dawn.

### The Gilded Tide, Captain Varro
- **eg_tide_1 · The Gilded Tithe** · Lv 15 · S (66) · Varro -> Varro · ms33
  Do: kill 20 gilt imps `[kill]`; kill 10 gilt hounds `[kill]`. Say: *"Every half hour the Rift pays what it owes. In gold, and with teeth."* Reward: 1 Codex of Aurelion.
- **eg_tide_2 · Scales of Aurelion** · Lv 17 · S (82) · Varro -> Varro · eg_tide_1
  Do: kill 4 gilt drakes `[kill]`; collect 4 Gilded Scales (QI17) `[collect]` `[T1]`. Items: QI17 drops from gilt drakes while active, 40% each. Reward: 1 Codex of Aurelion.
- **eg_tide_3 · King Aurelion** · Lv 19 · S (101) · Varro -> Varro · eg_tide_2
  Do: kill King Aurelion `[kill]`; kill 1 gilt colossus `[kill]`. Reward: 2 Codexes of Aurelion, 1 Jewel of the Rift.

### Wardens' work
- **eg_rift_1 · Closing the Tear** · Lv 17 · S (82) · Hale -> Hale · ms33
  Do: kill 30 hostile monsters (zombie, skeleton, spider, creeper) `[kill]` while a Rift is open. Say: *"Close the tear and be paid."* Reward: 1 Jewel of the Rift.
- **eg_hollow_1 · Ashes Again** · Lv 20 · S (101) · Hale -> Hale · ms38
  Do: kill The Hollow King `[kill]` again (a new Hollow Sigil is `give`n). Say: *"The Seal holds, but the Court remembers. Walk it again for the new ones."* Reward: 1 Codex of Aurelion.
