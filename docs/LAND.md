# Land claims

Players buy land with Auren (the in-game coins) using the **Land Surveyor** (item 620). What they build on a claim stays; the
wilderness outside claims is put back to how it was by a slow, safe regeneration.

## For players

1. Hold the Land Surveyor. A keys legend and a short tutorial appear (the tutorial is shown twice, then never again).
2. **Left-click** marks a corner (3 to 12, one per block). **Right-click** undoes the last one. **Interact** (E) near a corner moves
   it (click again to drop it) or removes it. A click on an edge of a closed shape adds a corner there (to grow a claim round a bend); it is
   in your hand until you click where it belongs, and right-click takes it away. A stake with a beam of light and a wall of light follow the ground.
3. **E** closes the shape; **E** again shows the price and the confirmation (what stays, what regenerates).
4. **Buy** is atomic and idempotent: a repeated click or a lost connection never charges twice.
5. **B** opens *My lands*: rename, invite players (builder / member), give a guild a role, public permissions, expand, release (with
   the refund and the grace time stated), recover items from the recovery box.
6. **Esc** cancels the marking (leaving the pointer lock does the same). That Escape is the Surveyor's: the pause screen does not come up, and the game asks for the mouse back at once (where the browser refuses, the next click takes it). Esc with nothing marked opens the pause screen as always.

Colour of the preview: green = can be bought, amber = a warning (e.g. near the limit), red = refused (the reason is written).

### The staff in the hand

The Surveyor is its own item in the first-person hand (`apps/web/src/game/held/surveyor.ts`): a staff that sways, leans out toward the crosshair while a
shape is marked, and whose gem glows the colour of the verdict (green, amber, red; it stutters when refused). Each corner is the staff driven into the
ground (with a flash), a corner taken back is a tug upward, closing the shape turns the staff once, and a purchase raises it in a gold light and brings
it down like a seal. The land only tells the hand what is happening (`SurveyorSignals`); nothing of it is a rule.

### Straight corners

The Surveyor shows when the corners are true. An edge is straight when it runs exactly along the x or the z axis; a corner is square when a straight edge along x meets one along z.

- A white **square tick** is drawn at every square corner.
- When the crosshair is in line with a corner already marked (same x or same z), a white line is drawn to it and the panel says *In line with corner N*.
- A closed shape with straight edges that turns four times is a **perfect rectangle** (a **perfect square** when it is as wide as it is deep): its edge is drawn in white as well, and the panel says *Perfect rectangle, 20 x 14* (sizes are in blocks, as the server counts them). While the shape is still open, the panel says when the corner under the crosshair would make it perfect.
- Otherwise the panel says how many edges are straight (*Straight edges: 3 of 4*). An L shape is called *Straight edges, square corners*.

This is only a drawing aid: it asks nothing of the server and changes no price, so a shape that is not straight can be bought like any other.

### The fence, the gate and the sign

When a purchase goes through, the server fences the land (`landFence.ts`, `LandConfig.fenceOnBuy`, on by default):

- A **fence** of oak runs along the whole boundary (on the outermost blocks of the claim), on the highest solid ground within four blocks of the ground the claim was measured on. It is never put on the top of a tree, and it is not put in water (a lake is a gap in the line, not a fence on the lake bed). Where the boundary has only a corner in common the ring is joined, so that there is no gap to slip through, whatever the shape of the claim.
- A **gate** stands on a straight stretch of the boundary nearest to where the buyer stood, closed, across the line of the fence.
- Beside the gate, an **oak sign** with its writing turned outward: *Property of*, the owner's name (a guild's name for a guild's land), and the name of the claim when the buyer gave it one.
- All of it is the owner's build: it is recorded in the land's ledger like any block they place (so it stays when the claim stays, and goes with the wilderness if the claim is let go), it is theirs to open or take down, and strangers cannot touch it.
- The deed comes first. If the fence cannot be built the buyer keeps the claim and is charged only the price; the fault is logged.
- When a claim is **expanded**, the old fence, gate and sign are taken down (only blocks still being an oak fence, gate or sign on the old boundary) and a new ring is built. The sign is not rewritten when a claim is renamed: write on it yourself.

### Writing on signs

Every sign can be written on, as in Minecraft:

- Putting a sign up opens the editor at once; using a sign (right click) opens it again with what it says. Four lines of 15 characters each, Enter goes to the next line (and finishes on the last), **Done** keeps it, **Esc** or **Cancel** leaves it as it was.
- The editor sends `{t:'sign', x, y, z, lines}`; the server decides: the block must be a sign, within reach, in a place the player may build in (the claim's permissions apply, so a stranger cannot change the owner's sign), and the lines are cleaned (`signText.ts`: control and bidirectional characters, `<` and `>` are removed, whitespace is collapsed, 4 lines, 15 characters). A sign left blank keeps nothing.
- The words are kept with the world (block entities), go away with the sign when it is broken, and are sent in the snapshots to the players within 48 blocks (`signs`, again when a sign near them changes or they walk into another square of 8 blocks). The client draws them on both faces of the board (`signBoards.ts`), so they can be read from the front and the back.

### The server's own territory

Ground nobody can buy or change (Dawnwatch, the outposts, the vaults, the chapel ruin, the landmarks the land keeps free, and places an
administrator reserved with `/land reserve`) has **no visual in the world**: nothing is drawn round it. With the Surveyor in the hand the readout under the
crosshair says "Server territory" and why it cannot be claimed, and walking in is announced once (and again after a minute away). The server tells each
client the zones within 220 blocks (`{k:'zones'}`, when the list changes, every few seconds at most, and again on `hello`); the client only uses them for those words:
the refusal to sell or change that ground is the server's (`assess`, `isProtected`). Old builds kept free for their builder (`legacy` reservations) are not
shown as server territory.

## What is guaranteed

- The server decides everything: price, ownership, permissions, balance. The client only shows and asks.
- Every edit path (mining, placing, buckets, fire, explosions and the other writes the server makes to the world) goes through `GuardedWorld` and
  `LandService.checkBuild`. A claim protects the volume from `depth` blocks under the *original* ground to `height` above it.
- Claims are saved in SQLite (tables created by `SqliteLandStore`) and kept across restarts; an active claim's build is never regenerated.
- Wilderness regeneration works in three layers (holes filled, placed blocks removed, ores returned), only after the area has been
  quiet and with no player near. Containers with items hold a region back, then the items go to a recovery box. A region that cannot
  be restored is kept as it is.

## Configuration

`LAND_CONFIG` is a JSON object of the settings to change (see `packages/shared/src/landConfig.ts`). Unknown keys and values of the wrong
kind are reported at start-up and ignored.

```
LAND_CONFIG={"pricePerBlock":8,"maxArea":4000,"refundPercent":50,"regen":{"placedHours":24}}
```

Claims last for ever by default (`abandon: 'permanent'`). With `"abandon":"inactivity"` a claim whose owner has not been seen for
`inactivityDays` (default 180) enters a warning period of `expiryWarningDays` (30) and is then released like any other. It is still
protected during the warning, and the owner coming back (or taking it back by hand) ends it. A release the owner chose is never undone
by logging in. Only that policy's own expiries are, and they are remembered across restarts.

## Administration

Administrators (`ADMIN_WALLETS` / `ADMIN_ACCOUNTS`, then `/admin on`) get `/land help`:
`here`, `list [player]`, `info <id>`, `revoke <id> [refund]`, `invalid`, `reserve <name> [radius]`, `unreserve <id>`, `reserved`,
`pause`, `resume`, `queue`, `stats`, `restore [radius]`, `rollback <radius> [player]`, `audit [player]`, `log`, `backups`,
`legacy scan|reserve|adopt`. Every action is logged.

### Old builds (before there was land)

What was built before the land system exists is not in the ledger and not in any claim: it is never put back, but nobody owns it, so
anybody could buy the ground under it. The block data has no author, so the administrator decides who it belongs to.

1. `/land legacy scan [minBlocks]`: finds changes to the world that nobody owns (default 40 blocks or more; digging and water do not count;
   changes that regenerate and the world's own places are left out) and groups them into numbered sites with a box. It also lists
   things the world changed by itself, such as a grown tree or crops, so look at the box before giving it away.
2. `/land legacy reserve`: keeps every scanned site free of purchases until it is adopted (`reserved` lists them; `unreserve` lets one go).
3. `/land legacy adopt <player> <#n> [name]`: the player (online, signed in) is given the land under site `#n`, with three blocks around it.
   It costs them nothing, takes none of their land allowance, is protected and listed like a purchased claim, and its blocks stay
   exactly as they are. Releasing it refunds nothing (nothing was paid). A copy of every claim is saved first (`/land backups`), and the
   deed is recorded as an `adopt` transaction and in the log. The player is told.

## Tests

`packages/shared/src/land*.test.ts` (geometry, pricing, permissions, regeneration), `apps/server/src/land*.test.ts` and
`wildHint.test.ts` (rooms, wire, admin), `apps/web/src/game/land*.test.ts` (marking, controller, effects), and
`node scripts/land-look.mjs <url> <outDir>` (a real browser: shaders, HUD, confirmation; needs a running web server), and
`node scripts/land-online.mjs <outDir>`: the whole purchase for real. It starts its own game server (SQLite) and web server, signs in with a
mock wallet, marks four corners with the mouse, buys (pressing Buy twice), checks the Auren taken, the row on disk, restarts the server and
checks the claim and the Auren are still the wallet's. It also checks the fence, the gate and the owner's sign the server built (the sign's words as the client was sent them, and again after the restart).

Signs and the fence: packages/shared/src/signs.test.ts, landFence.test.ts, pps/server/src/landFence.test.ts (a purchase on a server, the sign sent to a neighbour, a stranger's words refused), pps/web/src/game/signBoards.test.ts (where the writing lies on all eight signs), and 
ode scripts/sign-look.mjs <url> <outDir> (a real browser: the editor, Enter/Esc, the board drawn on both sides).
