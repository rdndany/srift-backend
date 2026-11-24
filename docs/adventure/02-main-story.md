# PART 5 — Main story (38 quests)

## How to read a quest

```
### id · Name
category · Lv · XP tier (value) · duration · Giver -> Turn-in · Place · Requires
Purpose   why the quest exists (story + what it teaches)
Do        objectives, each with its trigger kind: [mine] [craft] [smelt] [kill] [collect] [place] [enter]
Items     what is given on accept, and quest items that drop only while the quest is active
Variants  class or choice differences (none unless written)
Say       offer / complete (progress is generated from the objectives)
Reward    xp, coins (see Part 11), items
Next      the quest(s) this opens
```

**Failure and recovery (the same for every quest).** There is no fail state. You can abandon and take a quest again. `collect` follows the bags, so a lost item is simply gathered again. Quest-item drops start again when the quest is accepted again. If the bags are full the reward drops at the player's feet (`collectOrDrop`). A quest that gives a `give` item gives it again on re-accept only if the player no longer has it.

**XP tiers:** S side 6%, C class 12%, M main 22%, F finale 35% of the class XP needed for that level. The value table is in Part 11.

**Tags:** `[T1]` quest-only drop, `[T2]` class gate, `[T3]` made outpost with its own named zone and NPCs, `[NEW-ITEM]`, `[NEW-NPC]`, `[NEW-ZONE]`. All are listed in Part 10.

Quest items (`QI..`) are defined in Part 7.

---

# ACT I — Waking (Lv 1 to 5, about 1.5 hours)

### ms01 · Embers in the Dark
main · Lv 1 · M (7 xp) · 4 min · Maren -> Maren · DW · Requires: none (the first quest)
- **Purpose:** you wake in Elder Maren's house. She sends you to get warm, and teaches the first three verbs: mine, craft, place.
- **Do:** mine 5 logs `[mine]`; craft a crafting table `[craft]`; place it `[place]`.
- **Items:** none.
- **Say:** *"You are awake. Good. Do not try to stand yet. There is a mark on your arm that is still warm, and the only thing the dark left on you is that stone in your hand. The hearth is cold. Fetch wood, and make something with it."* / *"A table. Hands that remember what they are doing, even when the head does not."*
- **Reward:** 7 xp, 14 coins, 8 torches, 4 bread.
- **Next:** ms02, plus the Dawnwatch side quests that open at Lv 1.

### ms02 · A Pick for a Pilgrim
main · Lv 1 · M (7 xp) · 6 min · Maren -> Brannoc · DW · Requires: ms01
- **Purpose:** tools and tool tiers. Meet the smith.
- **Do:** craft a wooden pickaxe `[craft]`; mine 8 stone `[mine]`; craft a stone pickaxe `[craft]`.
- **Say:** *"Take this word to Brannoc. A pick first, then a better pick. Everything in this land is a better pick."* / *"Good. You hold it like a person who has held one before. Interesting."*
- **Reward:** 7 xp, 20 coins, stone sword.
- **Next:** ms03, ms08.

### ms03 · Hot Food, Cold Night
main · Lv 2 · M (12 xp) · 8 min · Brannoc -> Nell · DW inn · Requires: ms02
- **Purpose:** hunger. There is no healing in this land: food is how you stay on your feet.
- **Do:** kill 3 animals (pig, cow, sheep or chicken) `[kill]`; craft a furnace `[craft]`; smelt 4 pieces of raw meat `[smelt]`.
- **Say:** *"You are thin as a rake. Nell at the inn feeds everyone who is hungry and hates everyone who is late."* / *"Eat that. Slowly. You cooked it yourself; that counts for more than you think."*
- **Reward:** 12 xp, 30 coins, 2 mushroom stew.
- **Next:** ms04. Opens Nell's side quests.

### ms04 · Something Wearing a Face
main · Lv 2 · M (12 xp) · 10 min · Varro -> Varro · Whisperwood edge · Requires: ms02
- **Purpose:** first combat, night, and the first quest item. The zombies carry the Rift's mark.
- **Do:** kill 6 zombies `[kill]`; collect 3 Rift-Singed Rags (QI01) `[collect]` `[T1]`.
- **Items:** QI01 drops from a zombie only while this quest is active, 35% each (on top of normal loot).
- **Say:** *"They gather at dusk, at the same place in Whisperwood, as if somebody had called them. Bring me a scrap of what they wear."* / *"The mark is stitched into the rag. The same mark as on your arm. I did not want to say it first."*
- **Reward:** 12 xp, 24 coins, leather chestplate.
- **Next:** ms05, ms07, ms09.

### ms05 · The Mark Wakes
main · Lv 2 · M (12 xp) · 4 min · Maren -> Mirel · DW, Undercroft · Requires: ms04
- **Purpose:** the Undercroft zone, and the first look at the Emberstone. A delivery quest.
- **Do:** carry Maren's letter `[collect 1 paper, given]`; enter the Undercroft `[enter]`.
- **Items:** `give` 1 paper (the letter).
- **Say:** *"Take this below. Mirel keeps the oldest records in the village. She will want to see that stone of yours."* / *"It is warm. It only does that near the Rift. Hold it a moment... there. Now you know what it does: stand still and hold the button on it, and it will take you home."*
- **Reward:** 12 xp, 24 coins, 6 torches.
- **Next:** ms06.

### ms06 · A Place to Come Home To
main · Lv 3 · M (19 xp) · 8 min · Mirel -> Mirel · DW · Requires: ms05
- **Purpose:** beds. The Emberstone takes you to your bed; no bed, it takes you to the village.
- **Do:** craft a bed `[craft]` (3 wool and planks: shear or kill sheep); place the bed `[place]`.
- **Say:** *"Your stone goes where your bed is. Build one wherever you mean to rest, and it will always bring you back."* / *"Now it has somewhere to take you. That is more than the Rift ever gave anybody."*
- **Reward:** 19 xp, 38 coins, 8 bread.
- **Next:** ms08, Mirel's side quests.

### ms07 · Where the Dark Found You
main · Lv 3 · M (19 xp) · 12 min · Isolde -> Isolde · Whisperwood Clearing · Requires: ms04
- **Purpose:** first exploration. The zombies stripped your pack.
- **Do:** enter the Clearing `[enter]` `[NEW-ZONE]`; collect 4 Torn Satchel Scraps (QI02) `[collect]` `[T1]`.
- **Items:** QI02 drops from zombies only while active, 25% each. Gather at dusk.
- **Say:** *"We found you here, face down. Whatever you carried, they took. Not for use. They took it the way a magpie takes things."* / *"A Warden's stitching. This satchel belonged to a sworn Warden of the Seal. Before you ask: no. I do not know what that means for you."*
- **Reward:** 19 xp, 38 coins, 24 arrows.
- **Next:** ms10.

### ms08 · Iron in the Blood
main · Lv 4 · M (28 xp) · 14 min · Brannoc -> Brannoc · Hills near DW · Requires: ms02
- **Purpose:** mining, torches in the dark, smelting.
- **Do:** mine 8 iron ore `[mine]`; smelt 8 iron ingots `[smelt]`; craft an iron pickaxe `[craft]`.
- **Say:** *"Stone is for beginners. The Rift's dead wear iron. So will you."* / *"That is a tool, not a toy. Take this bag. You will need to carry more than you think."*
- **Reward:** 28 xp, 80 coins, **bag 1** (the first extra bag).
- **Next:** ms09, Brannoc's side quests.

### ms09 · The Sigil Fee
main · Lv 4 · M (28 xp) · 8 min · Varro -> Varro · DW market · Requires: ms04, ms06
- **Purpose:** shops and coins. The Hollow Sigil is a Warden Scroll joined to a Hollow Bone.
- **Do:** craft a Hollow Sigil `[craft]` (buy the Hollow Bone from Tobin, 140 coins).
- **Items:** `give` 1 Warden Scroll.
- **Say:** *"The door below wants a sigil: a scroll and a bone. The watch has the scroll. The bone, you buy. Tobin sells them. Sell him what you have taken from the dark."* / *"That will open the door once. Make sure you want it open."*
- **Reward:** 28 xp, 80 coins, 12 torches, 2 bread.
- **Next:** ms10.

### ms10 · Into the Hollow Cellar
main · Lv 5 · F (61 xp) · 15 min · Varro -> Hale · Ruined chapel, Hollow Cellar · Requires: ms07, ms09
- **Purpose:** the first dungeon, and the end of the first act. The King's voice.
- **Do:** enter the Hollow Cellar `[enter]` (Lv 5, the Sigil is used up); kill 4 moss lurkers `[kill]`.
- **Variants:** class: a class item of the player's class `(classItems)`.
- **Say:** *"East down the gravel road, a ruined chapel, and in it a portal of black stone. Hale is inside. Do not go further than Hale until you are told."* / (Hale) *"You hear it? That is not the wind. That is a voice, and it said one word: 'Ember'. It said it to you."*
- **Reward:** 61 xp, 183 coins, class item, 4 bread.
- **Next:** ms11.

---

# ACT II — Three Embers (Lv 5 to 10, about 3 hours)

### ms11 · The Four Embers
main · Lv 5 · M (38 xp) · 10 min · Hale -> Maren · DW · Requires: ms10
- **Purpose:** the central lore, and navigation.
- **Do:** collect a map `[collect]` (Tobin, 60 coins); mine 1 redstone ore `[mine]`; craft a compass `[craft]`.
- **Say:** *"Go back to Maren. Take a map and a compass: you will not find the way by luck."* / *"The Dawn Seal was five Embers. Orrin carried the last. Reedhollow, Sandmere and Frostgate each hid one and forgot why. Start with Reedhollow: it is closest, and the water has been wrong for a month."*
- **Reward:** 38 xp, 114 coins, **bag 2**.
- **Next:** ms12.

## Reedhollow (swamp village, Lv 6 to 7)

### ms12 · The Reed Road
main · Lv 6 · M (51 xp) · 12 min · Maren -> Tamsin · RH · Requires: ms11
- **Purpose:** a delivery to the first other village. Boats.
- **Do:** carry the letter `[collect 1 paper, given]`; craft a boat `[craft]`; enter Reedhollow `[enter]` `[T3]`.
- **Say:** *"The marsh is wide and the causeway has sunk. Tamsin will take this letter, and you will need a boat."* / (Tamsin) *"A letter from Maren, and a stranger with a stone that glows. Sit. We have something to tell you, and the fish are not it."*
- **Reward:** 51 xp, 153 coins, 6 cooked meat.
- **Next:** ms13, ms14, Reedhollow's side quests.

### ms13 · Charms of the Drowned
main · Lv 6 · M (51 xp) · 12 min · Tamsin -> Tamsin · RH marsh · Requires: ms12
- **Purpose:** fighting in water, and the second quest-item drop.
- **Do:** kill 8 drowned `[kill]`; collect 5 Drowned Reed-Charms (QI03) `[collect]` `[T1]`.
- **Items:** QI03 drops from drowned only while active, 30% each.
- **Say:** *"The villagers who drowned wore a charm to keep the water away. They still wear them. Bring them back and we can bury our people properly."* / *"Thank you. They looked almost peaceful when you took them. The ground sings now. It never did before."*
- **Reward:** 51 xp, 153 coins, iron helmet.
- **Next:** ms15.

### ms14 · What the Marsh Gives
main · Lv 7 · M (65 xp) · 14 min · Dunstan -> Tamsin · RH · Requires: ms12
- **Purpose:** fishing, cooking fish. The village has no food.
- **Do:** craft a fishing rod `[craft]`; smelt 6 fish `[smelt]`; collect 6 cooked cod or salmon `[collect]`.
- **Say:** *"The marsh gives, if you are patient. Cast, wait for the splash, reel in. Do not reel in early. Do not be like me."* / *"Six fish and not a single one wasted. The whole village eats tonight."*
- **Reward:** 65 xp, 195 coins, 8 bread.
- **Next:** ms15.

### ms15 · The Reed Ember
main · Lv 7 · F (103 xp) · 18 min · Tamsin -> Tamsin · RH, Lush Cave · Requires: ms13, ms14
- **Purpose:** the first Ember. Caves and a zone.
- **Do:** enter the Lush Cave `[enter]`; collect 1 Reed Ember (QI04) `[collect]` `[T1]`.
- **Items:** QI04 drops from any hostile (zombie, skeleton, spider, creeper, slime) killed in the Lush Cave, 12% each, guaranteed after 15 kills without one.
- **Say:** *"We hid it in the lush cave. Our grandmothers called it the 'bottled sunrise' and told us never to look. We looked."* / *"It is warm. Take it to Maren. It was never ours to keep."*
- **Variants:** class item.
- **Reward:** 103 xp, 309 coins, iron chestplate, class item.
- **Next:** ms16.

## Sandmere (desert village, Lv 8 to 9)

### ms16 · Caravans in the Dust
main · Lv 8 · M (81 xp) · 12 min · Tamsin -> Idris · SM · Requires: ms15
- **Purpose:** a delivery across the desert, and water. The first long trip.
- **Do:** carry the letter `[collect 1 paper, given]`; collect 1 water bucket `[collect]` (craft a bucket, fill it); enter Sandmere `[enter]` `[T3]`.
- **Say:** *"Take this to Idris. Take him water as well; the desert people say a guest brings water."* / (Idris) *"Water! The right gift, and from a stranger. Sit, you are welcome here."*
- **Reward:** 81 xp, 243 coins, 6 cooked mutton or chicken.
- **Next:** ms17, ms18, Sandmere's side quests.

### ms17 · The Sun-Scorched Tally
main · Lv 8 · M (81 xp) · 14 min · Idris -> Idris · SM dunes · Requires: ms16
- **Purpose:** hunting husks. The caravan lost its accounts to them.
- **Do:** kill 8 husks `[kill]`; collect 6 Sun-Scorched Tally Sticks (QI05) `[collect]` `[T1]`.
- **Items:** QI05 drops from husks only while active, 35% each.
- **Say:** *"The husks took our tally sticks. They do not know what they hold. Without them, I cannot tell who owes what to whom."* / *"The marks tell a story: someone paid the caravan to move a sealed box from Greykeep. The box was never delivered."*
- **Reward:** 81 xp, 243 coins, iron leggings.
- **Next:** ms19.

### ms18 · Tags and Hides
main · Lv 9 · M (98 xp) · 14 min · Idris -> Idris · SM · Requires: ms16
- **Purpose:** the example you asked for. A hunt that gives normal loot and a quest item together.
- **Do:** kill 6 llamas `[kill]`; collect 8 leather `[collect]` (the llama's normal drop); collect 4 Caravan Tally Tags (QI06) `[collect]` `[T1]`.
- **Items:** QI06 drops from llamas and trader llamas only while active, 30% each, along with the leather.
- **Say:** *"My feral herd carries our tags on their collars. Bring me the tags and the hides, and I will tell you where the Ember went."* / *"You have a good eye. The Ember is in the dripstone cave to the east. Bring it, and Sandmere will not forget your name."*
- **Reward:** 98 xp, 294 coins, 6 bread.
- **Next:** ms19.

### ms19 · The Sand Ember
main · Lv 9 · F (156 xp) · 18 min · Idris -> Idris · SM, Dripstone Cave · Requires: ms17, ms18
- **Purpose:** the second Ember. A harder cave.
- **Do:** enter the Dripstone Cave `[enter]`; collect 1 Sand Ember (QI07) `[collect]` `[T1]`.
- **Items:** QI07 drops from any hostile killed in the Dripstone Cave, 12% each, guaranteed after 15 kills without one.
- **Say:** *"The cave sings when the wind blows through it. At the end of the song is a stone that is not stone. Take it."* / *"Two of five. The caravans will carry your story as far as the sea."*
- **Variants:** class item.
- **Reward:** 156 xp, 468 coins, iron boots, class item, **Fenrir horn** (teaches the first mount; Lv 8, press the mount key after right-clicking the horn).
- **Next:** ms20.

## Frostgate (snow village, Lv 10 to 11)

### ms20 · North by Snow
main · Lv 10 · M (117 xp) · 14 min · Idris -> Halvard · FG · Requires: ms19
- **Purpose:** the third village, coal and cold.
- **Do:** carry the letter `[collect 1 paper, given]`; mine 16 coal `[mine]` and collect it `[collect]`; enter Frostgate `[enter]` `[T3]`.
- **Say:** *"Halvard has run out of coal. Bring him sixteen, and he will listen."* / (Halvard) *"Coal. The first honest welcome we have had in a month. Come, warm yourself."*
- **Reward:** 117 xp, 351 coins, 2 mushroom stew.
- **Next:** ms21, ms22, Frostgate's side quests.

### ms21 · The Frozen Bells
main · Lv 10 · M (117 xp) · 14 min · Halvard -> Halvard · FG tundra · Requires: ms20
- **Purpose:** archers and cold-weather fights.
- **Do:** kill 8 strays `[kill]`; collect 5 Frozen Ward-Bells (QI08) `[collect]` `[T1]`.
- **Items:** QI08 drops from strays only while active, 30% each.
- **Say:** *"The bells on the gate rang for the Seal. The strays took them. Without them the Frost Ember hears nothing."* / *"I hear them! They ring in the right key. Now the Ember will answer."*
- **Reward:** 117 xp, 351 coins, arrows x32.
- **Next:** ms23.

### ms22 · Pelts for the Gate
main · Lv 10 · M (117 xp) · 14 min · Sigrun -> Halvard · FG · Requires: ms20
- **Purpose:** hunting animals and cooking.
- **Do:** kill 5 wolves `[kill]`; kill 2 foxes `[kill]`; smelt 6 rabbit `[smelt]`; collect 6 cooked rabbit `[collect]`.
- **Say:** *"Winter takes the weak. I feed the strong. Get me wolves for pelts and rabbits for meat."* / *"The gate will be fed and warm. Halvard will see it."*
- **Reward:** 117 xp, 351 coins, 4 cooked chicken.
- **Next:** ms23.

### ms23 · The Frost Ember
main · Lv 11 · F (221 xp) · 20 min · Halvard -> Halvard · FG, Deep Dark · Requires: ms21, ms22
- **Purpose:** the third Ember, in the hardest cave.
- **Do:** enter the Deep Dark `[enter]`; collect 1 Frost Ember (QI09) `[collect]` `[T1]`.
- **Items:** QI09 drops from any hostile killed in the Deep Dark, 12% each, guaranteed after 15 kills without one.
- **Say:** *"The deep dark is under the glacier. Nothing grows there but sculk. The Ember is down there, where the cold is not natural."* / *"Three of five. The last two are not for villages to guard."*
- **Variants:** class item.
- **Reward:** 221 xp, 663 coins, **bag 3**, class item.
- **Next:** ms24.

### ms24 · The Council of Embers
main · Lv 11 · M (139 xp) · 10 min · Halvard -> Maren · DW · Requires: ms15, ms19, ms23
- **Purpose:** return home with the three Embers. The story turns north.
- **Do:** collect the Reed, Sand and Frost Embers (QI04, QI07, QI09) `[collect]`; enter Dawnwatch `[enter]`.
- **Say:** *"Take them to Maren. She will know what to do with them."* / *"Three. I had hoped for one. You are more than lucky. The records of the Wardens are in Highmarket. Thessaly keeps them. Take a letter."*
- **Reward:** 139 xp, 417 coins, 8 cooked meat.
- **Next:** ms25.

---

# ACT III — The Records (Lv 10 to 15, about 3 hours)

### ms25 · The Walled Town
main · Lv 11 · M (139 xp) · 15 min · Maren -> Thessaly · HM · Requires: ms24
- **Purpose:** the town, and villager trading.
- **Do:** carry the letter `[collect 1 paper, given]`; collect 3 emeralds `[collect]` (trade with a villager); enter Highmarket `[enter]` `[T3]`.
- **Say:** *"Highmarket charges a toll at the gate, in emeralds. Trade for them. Every villager buys wheat, coal or flint."* / (Thessaly) *"A letter from Maren, a toll paid honestly, and a stone in your pocket that I have read about for ten years. Welcome."*
- **Reward:** 139 xp, 417 coins, 6 bread.
- **Next:** ms26, Highmarket's side quests.

### ms26 · The Hall of Records
main · Lv 12 · M (161 xp) · 18 min · Thessaly -> Thessaly · HM · Requires: ms25
- **Purpose:** paper, books and shelves. The archive was burned by Rift-fire.
- **Do:** craft a bookshelf `[craft]` (the books it needs are part of the recipe); place it `[place]`; craft 2 more books `[craft]` for the shelf.
- **Say:** *"The archive burned in the last tear. I need a shelf, and books to put on it. Paper from sugar cane, leather from a cow."* / *"A shelf, and the first books we have had in years. I will read to you in the morning."*
- **Reward:** 161 xp, 483 coins, 2 books.
- **Next:** ms27, ms28.

### ms27 · The Sixth Bearer
main · Lv 12 · F (257 xp) · 18 min · Thessaly -> Thessaly · HM, skeleton country · Requires: ms26
- **Purpose:** the twist. The records name the sixth bearer.
- **Do:** collect 4 Warden Ledger Pages (QI10) `[collect]` `[T1]`.
- **Items:** QI10 drops from skeletons only while active, 30% each.
- **Say:** *"The ledger was scattered by the skeletons that nest in the old barrows. Bring me the pages, and I will tell you what I have never said aloud."* / *"The sixth bearer was a Rift-marked wanderer with a stone like yours. They went below at the last tear, and did not come back. The date is... three months ago."*
- **Reward:** 257 xp, 771 coins, class item.
- **Next:** ms28.

### ms28 · Seal and Anvil
main · Lv 13 · M (186 xp) · 20 min · Thessaly -> Vael · HM · Requires: ms27
- **Purpose:** enchanting and jewels.
- **Do:** craft an enchanting table `[craft]`; place it `[place]`; collect 6 lapis lazuli `[collect]` (mine lapis ore).
- **Say:** *"The Seal can be mended only by something that can be mended. Vael teaches that. Ask her."* / (Vael) *"Lapis, a table, and a jewel on loan. Learn how to raise a piece of gear. One day you will raise a Seal."*
- **Reward:** 186 xp, 558 coins, 1 Jewel of Dawn.
- **Next:** ms29.

### ms29 · The Road to Greykeep
main · Lv 13 · M (186 xp) · 15 min · Thessaly -> Aldren · GK · Requires: ms28
- **Purpose:** the castle. Farming and bread: the garrison is starving.
- **Do:** carry the letter `[collect 1 paper, given]`; collect 10 bread `[collect]`; enter Greykeep `[enter]`.
- **Say:** *"Greykeep has been holding out for three hundred years, and there is nothing left to eat. Bread, as much as you can carry."* / (Aldren) *"Bread. I did not think I would see it again. Come in. Mind the third step."*
- **Reward:** 186 xp, 558 coins, 4 cooked meat.
- **Next:** ms30, ms31, Greykeep's side quests.

### ms30 · The Ashen Court
main · Lv 14 · M (213 xp) · 20 min · Aldren -> Aldren · HC · Requires: ms29
- **Purpose:** the Court's names. Dungeon, party.
- **Do:** enter the Hollow Cellar `[enter]`; kill 6 ashen knights `[kill]`; collect 4 Ashen Medals (QI11) `[collect]` `[T1]`.
- **Items:** `give` 1 Hollow Sigil. QI11 drops from ashen knights only while active, 30% each.
- **Say:** *"My knights are down there. They did not desert. They never left their post. Bring me their medals, so that the names are not lost."* / *"Four names. I will carve them in the wall. The King stood with them."*
- **Reward:** 213 xp, 639 coins, iron sword.
- **Next:** ms32.

### ms31 · Light in the Keep
main · Lv 14 · M (213 xp) · 14 min · Aldren -> Aldren · GK · Requires: ms29
- **Purpose:** building. The keep has been dark for three centuries.
- **Do:** craft 4 lanterns `[craft]`; place 6 lanterns `[place]`; place 10 torches `[place]`.
- **Say:** *"The keep is dark and the garrison forgets itself in the dark. Light every hall."* / *"For the first time in my life I can see the end of the corridor."*
- **Reward:** 213 xp, 639 coins, 12 torches.
- **Next:** ms32.

### ms32 · What Maren Knew
main · Lv 15 · F (383 xp) · 12 min · Aldren -> Maren · DW · Requires: ms30, ms31
- **Purpose:** the truth. Maren was your teacher.
- **Do:** carry Aldren's letter `[collect 1 paper, given]`; enter Dawnwatch `[enter]`.
- **Say:** *"Take this to Maren. Ask her what she did not tell you."* / (Maren) *"I taught you. I taught you everything you have forgotten. When you went below I thought I had lost you. When you came back with no name I thought it was a mercy. It was not mine to decide. I am sorry."*
- **Reward:** 383 xp, 1,149 coins, class item, **Black Fenrir horn** (second mount, Lv 14).
- **Next:** ms33.

---

# ACT IV — The Hollow Deep (Lv 15 to 20, about 2.5 hours)

### ms33 · Five Hands
main · Lv 15 · M (241 xp) · 8 min · Maren -> Hale · HC · Requires: ms32
- **Purpose:** the plan, and the three Embers returned.
- **Do:** enter the Hollow Cellar `[enter]`.
- **Items:** `give` 1 Hollow Sigil, the Reed, Sand and Frost Embers (QI04, QI07, QI09).
- **Say:** *"The Seal needs no bearer. It needs five hands, and five Embers. You carry the stone, and these three. The fourth is on the King's throne."* / (Hale) *"Everything below is the Court. Take them in order. When the King speaks, listen. He is not what he was."*
- **Reward:** 241 xp, 723 coins, 12 bread.
- **Next:** ms34, ms35, ms36 (take all three at once).

### ms34 · Moss and Spore
main · Lv 16 · M (271 xp) · 20 min · Hale -> Hale · HC, the mossy caves · Requires: ms33
- **Do:** kill 10 moss lurkers `[kill]`; kill 6 spore puffs `[kill]`.
- **Say:** *"The green caves are the Court's gardeners. Clear them."* / *"The way is open."*
- **Reward:** 271 xp, 813 coins, 6 glow berries.
- **Next:** ms37.

### ms35 · Ash and Bone
main · Lv 17 · M (302 xp) · 22 min · Hale -> Hale · HC, the dripstone caves · Requires: ms33
- **Do:** kill 8 ashen knights `[kill]`; kill 6 hollow priests `[kill]`.
- **Say:** *"The knights guard the stair, and the priests keep the flame. Break both."* / *"They fought as if they had a reason."*
- **Reward:** 302 xp, 906 coins, 4 lapis lazuli.
- **Next:** ms37.

### ms36 · The Dark Under
main · Lv 18 · M (336 xp) · 22 min · Hale -> Hale · HC, the deep caves · Requires: ms33
- **Do:** kill 6 shades `[kill]`; kill 6 ember wraiths `[kill]`.
- **Say:** *"The deepest cave: wraiths of the Seal and the shades it casts. They are fast. Do not run from them."* / *"The throne room is open. The King is waiting."*
- **Reward:** 336 xp, 1,008 coins, 6 cooked meat.
- **Next:** ms37.

### ms37 · The Hollow King
main · Lv 19 · F (590 xp) · 20 min · Hale -> Hale · HC, throne room · Requires: ms34, ms35, ms36
- **Purpose:** the boss: three phases, courts of helpers and announced spells.
- **Do:** kill The Hollow King `[kill]`; collect the Throne Ember (QI12) `[collect]` `[T1]`.
- **Items:** QI12 drops from The Hollow King only while active, 100%.
- **Say:** *"He will speak three times: once at the start, once at seventy percent, once at forty. Listen. The last words are for you."* / (the King) *"Bearer... you came back. Take it. End this."*
- **Variants:** a party fights the same encounter; every member with the quest active gets QI12.
- **Reward:** 590 xp, 1,770 coins, class item, 1 Jewel of the Rift.
- **Next:** ms38.

### ms38 · The Dawn Seal
main · Lv 19 · F (590 xp) · 10 min · Hale -> Maren · DW · Requires: ms37
- **Purpose:** the ending. Five hands.
- **Do:** collect the Reed, Sand, Frost and Throne Embers (QI04, QI07, QI09, QI12) `[collect]`; enter Dawnwatch `[enter]`.
- **Say:** *"Take them to Maren. The Emberstone you carry is the fifth hand."* / (Maren) *"Four Embers and one stone. Watch."* (The Seal is relit.) *"The bell has not rung since Orrin. Listen."*
- **Reward:** 590 xp, 1,770 coins, class item.
- **Next:** all endgame lines open: the Wings, the Companions, the Gilded Tide, the Rifts.
