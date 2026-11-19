# Putting SolRift online

The page (Next.js) runs on **Vercel**; the game server (WebSocket, sign-in, cloud saves, the world) runs on a **DigitalOcean Ubuntu droplet**.
Two names of one domain you own (here `solrift.io`):

| Name | What | Where |
|---|---|---|
| `solrift.io` (and `www`) | the presentation page (the `/welcome` page, chosen by the host in `next.config.ts`) | Vercel, same project |
| `play.solrift.io` | the game page | Vercel |
| `api.solrift.io` | the game server (`https://` and `wss://`) | the droplet, behind Caddy |

Both names must end in the same domain: the sign-in cookie is shared between them (`COOKIE_DOMAIN`),
otherwise a signed-in wallet would play as a guest in the multiplayer realm (the browser does not send the page's cookie to another site's socket).

How the pieces talk:

```
browser ── https://play.solrift.io ──► Vercel (page; /api/* is forwarded to https://api.solrift.io/*, so sign-in cookies are same-origin)
browser ── wss://api.solrift.io ─────► Caddy (TLS) ──► game server :8787 (node + SQLite in /var/lib/solrift)
```

## 1. The code on GitHub (done)

The whole project is pushed to two repositories, [srift-backend](https://github.com/rdndany/srift-backend) (the droplet takes the server from it) and
[srift-frontend](https://github.com/rdndany/srift-frontend) (Vercel builds the page from it). Both hold the same code, because the page and the server share
`packages/shared`. After a change, push both:

```powershell
git push backend main
git push frontend main
```

`.gitignore` leaves out `node_modules`, `.next`, `data/` and `.env*`.

## 2. DNS for the server

At your domain's DNS: an **A record** `api` pointing at the droplet's IP address (if the DNS is on Cloudflare, set it to "DNS only" at first).

## 3. The droplet (once)

For a private repository make a read-only token (GitHub, Settings, Developer settings, Fine-grained tokens, this repository, Contents: read-only) and use
`https://x-access-token:TOKEN@github.com/rdndany/srift-backend.git` as the repository address below (a public repository needs no token).

```powershell
scp deploy\setup-droplet.sh root@DROPLET_IP:/root/
ssh root@DROPLET_IP
```

On the droplet:

```bash
bash setup-droplet.sh https://x-access-token:TOKEN@github.com/rdndany/srift-backend.git api.solrift.io
nano /etc/solrift.env          # AUTH_ORIGINS=https://play.solrift.io,https://solrift.io,https://www.solrift.io   COOKIE_DOMAIN=solrift.io   (the rest can stay)
systemctl enable --now solrift-server
curl https://api.solrift.io/health      # {"ok":true,...}  (Caddy fetches the certificate on the first request; give it a few seconds)
```

The script installs Node 24, Caddy and a firewall (ssh, 80, 443 only), makes the `solrift` user, fetches the code into `/opt/solrift`, installs only what the
server needs and sets up the service (`deploy/solrift-server.service`) and Caddy (`deploy/Caddyfile`). Logs: `journalctl -u solrift-server -f`.

## 4. Vercel (the page)

1. vercel.com, **Add New, Project**, import the GitHub repository **srift-frontend**.
2. **Root Directory: `apps/web`** (leave "Include source files outside of the Root Directory" on: the page uses `packages/shared`). Framework: Next.js; Node 22 or newer
   (Settings, General).
3. **Environment variables** (Production, and Preview if you use it):
   - `NEXT_PUBLIC_SERVER_URL` = `wss://api.solrift.io`
   - `SERVER_ORIGIN` = `https://api.solrift.io`
4. Deploy, then **Settings, Domains**: add `play.solrift.io` **and** `solrift.io` (+ `www.solrift.io`, redirect to the bare one) and make the DNS record Vercel shows (a CNAME `play` to `cname.vercel-dns.com`).

Both variables are fixed at build time: change one and redeploy.

## 5. Try it

Open `https://play.solrift.io`, Play, Multiplayer: the realm shows its status ("Online 0 / 120"). Sign in with a wallet, make a character, enter. A second browser
(or a phone) sees you.

## Updating

- The page: `git push frontend main`; Vercel builds it by itself.
- The server: `git push backend main`, then on the droplet `bash /opt/solrift/deploy/update-server.sh` (players are dropped for a few seconds; the world is kept).
- When the network protocol changed (`PROTOCOL_VERSION`), update the **server first**, then the page.

## Backups

The world, accounts and characters are one SQLite database in `/var/lib/solrift`. Turn on DigitalOcean's droplet backups, or copy the folder now and then
(`sqlite3 /var/lib/solrift/solrift.db ".backup /root/solrift-$(date +%F).db"` is safe while the server runs).

## If something is wrong

| Sign | Cause |
|---|---|
| The realm says offline; the browser console shows a failed `wss://` connection | DNS for `api` is not pointing at the droplet yet, Caddy has no certificate yet (`journalctl -u caddy`), or `NEXT_PUBLIC_SERVER_URL` is wrong or was set after the build (redeploy) |
| Sign-in says `origin not allowed` | `AUTH_ORIGINS` is not exactly the page's address (`https://play.solrift.io`, no slash, https). Restart the server after changing it |
| You sign in but play as a guest in the realm | `COOKIE_DOMAIN` is missing or is not the domain both names end in, or `COOKIE_SECURE=1` is missing. Sign out and in again after fixing it |
| `/api/...` calls fail with 502 or 404 | `SERVER_ORIGIN` is wrong (it must be `https://api.solrift.io`, no path) |

## Limits to know

- One server process runs one world, on one droplet (the default cap is 120 players). More players or several realms need more machines and a shared database.
- The sign-in endpoints allow 30 requests a minute per address. The page reaches the server through Vercel, so those requests all arrive from Vercel's addresses; for a
  large crowd signing in at once that limit will need to be raised or moved (the socket connections are limited per real address, as Caddy passes it on).
- Uploads of big cloud saves go through Vercel's `/api` forwarding; if they fail with a 413, tell us and the page can call the server directly instead.
