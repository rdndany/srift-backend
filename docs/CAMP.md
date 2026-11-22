# The Camp (`/camp`): SolRift from a phone or a tablet

The game needs a keyboard and a mouse. The Camp is the part of it that works with a finger and no game running: look after your hero, trade, collect a daily gift, send the hero on expeditions, and chat.

## What it does

| Tab | What you can do |
| --- | --- |
| Hero | See the bags, what is worn and the Stash. Wear, take off, move a stack, put things in or take them out of the Stash, put things up for auction. Daily check-in on top. Switch between your heroes. |
| Market | Browse the Auction House (live), bid, buy out, cancel your own auctions that have no bid, collect mail. |
| Trips | Send the hero on an expedition, see the countdown, collect what it found. |
| Realm | The realm's public chat (read and write), who is online, and your guild's roster (read only). |

Not here, on purpose: fighting, building, crafting, shops, creating or deleting heroes, `/commands`, guild management, and anything in $SOLRIFT (auctions priced in $SOLRIFT are visible but must be bid on in the game).

## Signing in on a phone

A phone's browser has no wallet extension. Where no wallet is found, the sign-in shows "Open in Phantom" and "Open in Solflare": deep links (`https://phantom.app/ul/browse/<url>?ref=<origin>`, `https://solflare.com/ul/v1/browse/<url>?ref=<origin>`) that open the same page inside the wallet app's own browser, where the wallet is available and sign-in works as on a computer.

## How it works

- **No game is started.** `GameRoom.withSavedHero` reads the saved hero into a `Player` with no body in the world, stands it at the Auctioneer or the Stashkeeper (`Player.atCounter`) and applies the game's own validated `Command`. Only the bags, the worn slots, the purse (and the Stash and the Auction House when they were touched) are written back. The temporary player is always removed again.
- **Same rules as the game.** Stash and auction acts go through `parseNetClientMessage`, so the numbers are checked by the game's own parser. Wearing and moving use `Player.deskEquip`, `deskUnequip` and `deskSwap`.
- **The game holds the live copy.** While the hero (or any hero of the same wallet, for the Stash) is in the room, every change is refused and the page shows a notice. Heroes in creative mode, and heroes that were never played, have no Camp.
- **No way around the economy.** The Camp gives no experience, no $SOLRIFT and no gear. Coins it adds do not count toward achievements.
- **API** (`apps/server/src/desk.ts`, proxied as `/api/desk/*`): `GET /desk/hero`, `POST /desk/act`, `GET /desk/chat?since=N`, `POST /desk/chat`. All need a session; POSTs need an allowed Origin and `application/json`. Rate limit: 120 requests a minute per account. Chat: one line every 2 seconds per account, bans and mutes apply, `/commands` are refused.

## Daily check-in and expeditions (`packages/shared/src/camp.ts`)

State is kept in the room store as `camp:<wallet>` (one check-in a day for the wallet; trips are per hero).

- **Daily:** 60 Auren on day one, 40 more for each day in a row up to day 7 (300). Every seventh day also brings 3 gold ingots. A missed day restarts the streak. Days are UTC.
- **Expeditions:** Forage the Meadows (15 min, level 1), Raid the Old Quarry (1 h, level 3), Search the Hollow (4 h, level 6), Delve the Deep (8 h, level 10). Each pays a range of Auren and some common materials. The result is fixed by a seed when the trip starts (so reloading cannot reroll it) and hidden until the hero is back.
- **Wings** shorten a trip by 15%. A **companion** finds 10% more. Both only count if worn when the trip starts.
- Collecting needs room in the bags: if anything would not fit, nothing is given and the trip stays until there is room.

## Tests

`apps/server/src/desk.test.ts` (service, daily, trips, chat, guild card), `packages/shared/src/camp.test.ts` (the rules).
