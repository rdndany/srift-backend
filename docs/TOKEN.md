# The $SOLRIFT token: how it works and how to switch it on

The game is built so that **adding the token later is a configuration change, not a code change**. With nothing set, the token is off:
achievements pay nothing, the website says "Announced at launch", and no balance or wallet panel is shown. Set `TOKEN_MINT` and the
whole thing turns on.

## Switching it on

On the game server (`apps/server`), set these environment variables:

| Variable | Needed | What it does |
|---|---|---|
| `TOKEN_MINT` | to turn it on | The token's mint address. Validated at start-up. Everything else on this page keys off it. |
| `SOLANA_CLUSTER` | with `TOKEN_MINT` | `devnet`, `testnet` or `mainnet-beta`. Required, on purpose: the same address means different things on different networks, so there is no silent default. |
| `SOLANA_RPC_URL` | optional | Your own RPC endpoint (recommended on mainnet). Defaults to the public one for the cluster. |
| `TREASURY_KEYPAIR` | to allow withdrawals | Path to a Solana CLI keypair file (JSON array of 64 bytes) whose token account holds the tokens to pay out. Without it, players earn and see a balance but "Withdraw" is closed. **Keep this file out of the repository** (the `.gitignore` already skips the usual names). |
| `TOKEN_DAILY_POOL` | optional (50000) | Whole tokens the game may reward per UTC day, across everyone. When it is dry, rewards stop until tomorrow. |
| `TOKEN_WALLET_DAILY_REWARD` | optional (500) | Most one wallet can be rewarded per UTC day. |
| `TOKEN_MIN_WITHDRAW` | optional (20) | Smallest withdrawal, in whole tokens. |
| `TOKEN_WALLET_DAILY_WITHDRAW` | optional (1000) | Most one wallet can withdraw per UTC day. |
| `TOKEN_CLEAR_REWARDS` | optional (`20,10,5,3,2`) | What a dungeon clear pays a wallet through one UTC day, in order: the first clear pays the first number, the next the second, and once the list is used up the day's clears pay nothing. `off` turns clear rewards off. |
| `TOKEN_SLOT_PRICES` | optional (`100,250`) | What extra hero slots cost, in order: a wallet's first bought slot (its 4th character) costs the first number, the second bought slot (5th character) the second, and then there are none left. `off` stops selling them. |
| `TOKEN_STASH_PRICES` | optional (`50,120`) | What the extra stash tabs cost, in order (27 slots each, at most 4). `off` stops selling them. |
| `TOKEN_OUTFIT_PRICES` | optional (`30,60,120`) | What an outfit costs by tier: common, rare, epic (exactly three amounts). `off` stops selling them. |
| `TOKEN_KEY_PRICE` | optional (`15`) | What a Hollow Key costs, in whole $SOLRIFT. `0` stops selling them. |
| `TOKEN_BOUNTY_REWARDS` | optional (`3,6,12`) | What a daily bounty pays: the easy one, the medium one and the hard one (exactly three numbers). `off` stops paying for bounties (they are still shown and counted). |

Put them in `apps/server/.env` (copy `apps/server/.env.example`; the file is git-ignored). The server reads it at start-up,
and a variable set in the real environment wins over the file, so a host's own settings are never overridden.

```bash
TOKEN_MINT=<your mint address>
SOLANA_CLUSTER=devnet
# when you are ready to let players withdraw:
TREASURY_KEYPAIR=/secure/path/treasury.json
```

Restart the server after changing them. The website needs nothing: it reads the mint, supply and decimals from the server
(`GET /api/token/info`), which reads supply and decimals from the chain. Both Token and Token-2022 mints work.

Before opening withdrawals: send the tokens you want to give out to the treasury's **associated token account** for the mint, and give
the treasury wallet a little SOL (it pays the network fee and the small rent for a player's token account the first time).

### Trying it without a token

`TOKEN_DEV_MOCK=1` (with any valid address in `TOKEN_MINT`) runs the whole flow against an in-memory fake chain: rewards, the balance,
withdrawals and their history all work, but nothing reaches Solana. It refuses to start when `NODE_ENV=production`.

## What it does

- **Rewards.** Winning an achievement pays its tier into the wallet's balance: Bronze 5, Silver 15, Gold 40, Mythic 120 (`ACH_TIERS` in
  `packages/shared/src/achievements.ts`). The server decides everything; the client only shows it. A reward is paid **once per wallet
  per achievement** (so a character that is deleted and made again cannot win it twice), only to a signed-in wallet, and never in creative
  mode, in admin mode, or on a server with `CHEATS=1`. It counts against the daily pool and the wallet's daily cap.
  Achievements won before the token was switched on are **not** paid back.
- **Dungeon clears.** Bringing down the Hollow King (the only boss today, so a boss kill and a dungeon clear are the same event) pays
  the next amount on `TOKEN_CLEAR_REWARDS` for that wallet and UTC day: 20, 10, 5, 3, 2, then nothing until tomorrow. Each clear is its own
  ledger row (`clear:<day>:<n>`), so two clears in the same instant cannot take the same slot. It pays **each player who landed a hit on a
  mob in the last 60 seconds** (not someone who only stood in range of the kill), under the same rules and the same pool and caps as achievements.
  The amounts are not split between a party: grouping does not cost anyone their reward. (Daily bounties are not in the game yet, so nothing pays for them.)
- **Daily bounties.** Every UTC day the realm posts three bounties (easy, medium, hard), picked from the day alone (`bountiesOn` in
  `packages/shared/src/bounties.ts`) so every player sees the same three and they ask for three different deeds (slay, earn Auren, play, defeat
  elites, clear the Hollow Deep). A character counts them from the start of the day (they ride on the same deed counter as the achievements),
  its progress is saved with it and starts over each day, and the quest log (L) shows them under **Daily**. A finished bounty pays its tier on
  `TOKEN_BOUNTY_REWARDS` once **per wallet per day** (ledger ref `bounty:<UTC day>:<id>`, so another character of the same wallet that does
  the same one is not paid again), under the same honest-play rules, pool and wallet cap as every other reward. Only a bounty that was posted
  for today (or for the day that ended a moment ago, so one finished just before midnight is not lost) is paid.
- **Spending.** A balance is a claim on the treasury wallet, and the tokens only leave it when a player withdraws. When a player
  buys something with $SOLRIFT the game writes a `spend` row (negative) to the ledger and the tokens simply stay in the treasury,
  where they back the balances and fund later rewards. Nothing is burned on chain, and a spend is **not** an emission: it never
  counts against the daily pool or a wallet's reward cap. `GET /api/token/info` reports the running total as `pool.spentTotal`.
  Today the one thing for sale is the **hero slot** (`POST /api/token/buy {sku: "hero-slot"}`): a wallet may have 3 characters, and each slot it
  buys lets it have one more, up to the number of prices in `TOKEN_SLOT_PRICES`. The slot is the wallet's, kept when a character is deleted.
  The debit and the slot are written in **one database transaction** (`TokenRepo.purchase`), so a purchase is whole or not there, and the
  `(wallet, ref)` of a spend (`hero-slot:<n>`) is unique, so two purchases can never both become the same slot.
- **Stash tabs.** The third thing for sale (`sku: "stash-tab"`, `TOKEN_STASH_PRICES`, default `50,120`, `off` stops selling them) adds 27 slots
  (three rows) to the wallet's shared Stash, up to 4 tabs whatever the list says. Like a hero slot it is the wallet's for good. The stash's
  size is derived from the perk (`StashVault.tabsOf`), so a tab bought while the game is running appears the next time the Stashkeeper is
  opened, and a saved stash is never cut down: it loads at least as big as what was written, so nothing in it can be lost if the perk is ever gone.
- **Outfits.** Twenty-four cosmetic sets of armor, **eight for each class** (`OUTFITS` in `packages/shared/src/outfitData.ts`, each with a `cls`), in the
  manner of the glowing sets of MU Online. The Warrior's are plate with its own light (seams, gems), horned or crowned helms, spiked pauldrons and
  wings of curved blades; the Mage's are robes with pointed hats, crowns and horns, collars and mantles, sigils, rings and orbiting orbs, shards,
  stars or moons; the Ranger's are hoods, masks and feathered caps, quivers, cloaks and great wings of feathers. All have a halo, rings of runes
  on the ground and sparks that drift, rise or are drawn in, in the set's colours; the richer the tier the more there is (per class: 3 common,
  3 rare, 2 epic). The picture is made by the client: `apps/web/src/game/setKit.ts` holds what the sets share, `warriorSet.ts`, `mageSet.ts` and
  `rangerSet.ts` the sets of each class, and `setGear.ts` picks by class. A set takes the place of the armor in what others see: the armor still
  counts, it is only not drawn. They change nothing else, and no gear that makes anyone stronger is ever for sale.
  **Each set is an ITEM** (`outfitSetItemId`, ids `520 +` its place in `OUTFITS`, one picture each in the atlas, `use: 'outfit'`, `kind: 'Outfit'`, one to
  a stack). It is bought with `POST /api/token/buy {sku: "outfit:<id>"}` at a price by tier, `TOKEN_OUTFIT_PRICES` = common,rare,epic (default
  `30,60,120`, `off` stops selling them), **and goes into the wallet's Stash**: with no free slot it cannot be bought and nothing is spent (409). The
  room is checked before the spend and the item put in right after it, in the same tick with nothing awaited between (`TokenService.buyOutfit`,
  `GameRoom.stashFree/stashGive`, which reads the stash from the store when none of the wallet's heroes is in the world and writes it down at once);
  if the Stash still refused, the price is credited back (`refund:` row). Buying the same set again gives another item (the perk row `outfit-item:<id>`
  only numbers the spend rows). Any class's set may be bought; once it is an item it can be stored, carried, dropped and traded like any other (it is
  not undroppable), so what a wallet owns is what it holds. **A hero wears a set by putting it in the new outfit slot** of the inventory screen (top
  right of the figure; `Player.outfitSlot`, saved with the hero as `outfitSlot`, next to the mount slot): right-click the item in the hotbar or bags,
  shift-click it, or drag it in. The slot (`CraftingMenu.outfitSlot`, `Player.equipOutfit`) takes **only a set of the hero's class** (a hero with no class
  takes any); a hostile save with another class's set in it carries it but never shows it (`Player.wornOutfit`). What others see is computed from that
  slot every snapshot (`lookOf` in `room.ts`), so putting one on or off shows at once, to everyone and on your own body; the lobby shows the set in the
  saved hero's slot (`GameRoom.wornOutfitOf`). The token page has a stand, with a tab for each class, that shows any set, turning, before it is bought.
  On the wire an outfit is part of the `look` number (`look + LOOK_COUNT * n`, n = the 1-based position in `OUTFITS`, so **new sets are only ever
  appended**: the order is the wire format and the item id), so every player who sees another sees it with nothing else changed; the server alone makes
  that number, and `parseLookCode`, which checks what a guest sends or an account saves, accepts a plain look only, so a client cannot dress itself in a
  set it does not hold. (The old `character_outfits` table and `POST /api/token/outfit` are gone: the slot is the only truth.) The first eight sets (the
  Warrior's) are the ones that shipped before the sets were per class, with the same ids.
- **Hollow Keys.** The second thing for sale (`POST /api/token/buy {sku: "hollow-key"}`, `TOKEN_KEY_PRICE`, default 15, `0` turns it off)
  is a consumable: a wallet may hold up to 10, and one opens the Hollow Deep in place of a Hollow Sigil. A sigil is used first; without one
  a key is taken, and only when a **new** copy of the dungeon opens, so stepping back into a copy that is still open, or following a party
  member into theirs, costs nothing. The key is the wallet's (`wallet_perks`), so it follows the wallet to any hero, and taking it is one
  `UPDATE ... count > 0`, so a key cannot be used twice. Each purchase's spend row is numbered by how many were ever bought
  (`hollow-key:<n>`), not by how many are held, so buying again after using some never collides. Like the auction, it is for honest play only.
- **The Auction House.** A seller may price an auction in $SOLRIFT instead of Auren (1 to 1,000,000, whole tokens); the deposit is still
  Auren. The buyer pays from their balance at the moment of the bid, and an outbid bidder is refunded at once, straight to their balance
  (not by mail). When it sells, the seller's balance is credited the price less the house's 5% and the cut is credited to the ledger
  account `house`, so the rows of one sale (`trade`, `trade`, `fee`) add up to **zero**: nothing is created or destroyed, and the fee
  (like a spend) stays in the treasury and counts in `pool.spentTotal`. It is for honest play only (a signed-in wallet, not creative, not admin
  mode, not a `CHEATS=1` server) and a wallet cannot bid on its own auction under another character's name.
  The house queues each movement as a numbered move; the server writes the moves **and the house itself in one database transaction**
  (`TokenService.commitTrades`) and only then forgets them, with `(wallet, ref)` unique so a move sent twice (a crash between the ledger and
  the house) is written once. Until the ledger has a move it still counts against the wallet's spendable balance, so it cannot be spent twice.
- **In the game.** A signed-in player sees the balance under their bars in the character frame and in their bags beside the coins, and a
  reward that lands shows as a green "+N" for a few seconds. The client reads the balance again whenever the server tells the player
  something about $SOLRIFT.
- **Balance.** One per wallet, shared by its characters, kept in the server database (`token_ledger`). The player is told in game
  ("+40 $SOLRIFT added to your balance"), and sees the balance beside their name and on the token page.
- **Withdrawals.** `POST /api/token/withdraw {amount}` sends whole tokens from the treasury to **the wallet that is signed in** (there is no
  way to name another address). The balance is debited first; the signed transaction's signature is written down before it is broadcast;
  and the debit is only given back when the transaction is known not to have landed. A background reconciler (every 30 s and at start-up)
  settles anything left pending by a crash or a lost answer, by asking the chain. One withdrawal per wallet at a time.

## Where the code is

- `apps/server/src/token.ts`: config from the environment, `TokenService` (rewards, limits, withdrawals, reconciling) and the `/token/*` routes.
- `apps/server/src/tokenChain.ts`: Solana (`SolanaChain`) and the in-memory `MockChain`, behind one small interface.
- `apps/server/src/tokenRepo.ts`: the ledger table and the bought perks (`wallet_perks`). Rewards are unique per `(wallet, achievement)`; a balance is the sum of rows that did not fail.
- `apps/server/src/room.ts`: `onAchievement` pays when an achievement event is sent to a member; `onClear` pays a dungeon clear to the members who were fighting (`fightTick`).
- `apps/web/src/token/store.ts`, `components/TokenWallet.tsx`, `TokenPage.tsx`: the page, the wallet panel and the balance next to the account.
- `apps/server/src/token.test.ts`: the tests, including the failure paths (a lost confirmation, an expired transaction, an empty treasury, two withdrawals at once).

## Before real money

This is a utility token for the game, not an investment (the page says so). Before mainnet: get legal review, put the treasury key in a
proper secret store (not a file on the app server's disk if you can avoid it), use a dedicated RPC, watch the `[solrift] token:` log lines,
and consider a hardware or multisig treasury that tops up a small hot wallet instead of one that holds the whole supply.
