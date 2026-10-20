# VEX online service

Powers **Sign in with Modrinth** and **Friends** (search, requests, online status) for VEX CLIENT.
It's a Cloudflare Worker with a D1 database — the free tier is plenty.

**Privacy & safety**
- The Modrinth login happens on modrinth.com in the player's browser. VEX never sees passwords.
- The Modrinth client secret lives only in Cloudflare. The Modrinth access token is used once to read the player's id, name and avatar, then thrown away.
- The launcher gets a VEX session token (stored encrypted with Windows DPAPI). The server stores only a SHA-256 hash of it.
- Only friends see each other's online status. Search shows name + picture only.

## Easiest: double-click **`Set up VEX online.bat`**
It installs what's needed, signs you in to Cloudflare (click **Allow** in the browser), creates the database,
deploys, walks you through registering VEX on Modrinth (the redirect address is copied for you), and
points VEX at your new service. If anything stops, fix it and double-click again — finished steps are skipped.

## Deploy by hand (about 10 minutes, one time)

You need Node.js and a free Cloudflare account (dash.cloudflare.com/sign-up).

```powershell
cd vex-client\server
npm install
npx wrangler login                     # opens your browser to allow access
npx wrangler d1 create vex-online      # prints a database_id
```

1. Paste that `database_id` into `wrangler.toml`.
2. First deploy, to get your address:
   ```powershell
   npm run db:init
   npm run deploy                     # prints https://vex-online.<your-name>.workers.dev
   ```
3. Register VEX on Modrinth: **modrinth.com/settings/applications → New application**
   - Name: `VEX CLIENT`
   - Redirect URI: `https://vex-online.<your-name>.workers.dev/auth/callback`
   - Scope: **Read user data** (`USER_READ`) only
4. Copy the **Client ID** into `wrangler.toml` (`MODRINTH_CLIENT_ID`), then set the secret and redeploy:
   ```powershell
   npx wrangler secret put MODRINTH_CLIENT_SECRET   # paste the Client Secret when asked
   npm run deploy
   ```
5. Open `https://vex-online.<your-name>.workers.dev/` — you should see `{"service":"vex-online","ok":true}`.

Never put the Client Secret in the launcher or in GitHub — only in `wrangler secret put`.

## Connect the launcher
- **For everyone (recommended):** put the address in `launcher/electron/config.ts` → `DEFAULT_ONLINE_URL`, then publish a new VEX release. Every player gets it automatically through the updater.
- **Just for you, right now:** VEX → Settings → Account → *Online service address*.

## API (all `/v1/*` routes need `Authorization: Bearer <VEX token>`)
| Route | Does |
|---|---|
| `GET /auth/start?port&state` | Starts Modrinth login, returns to `http://127.0.0.1:<port>/callback` |
| `GET /v1/me` | Your profile |
| `POST /v1/presence` `{status, detail}` | Heartbeat (launcher sends every 60 s; online = seen in the last 2 min) |
| `GET /v1/users/search?q=` | Find players (2+ characters) |
| `GET /v1/friends` | `{friends, incoming, outgoing}` |
| `POST /v1/friends/:id` | Send a request, or accept theirs |
| `DELETE /v1/friends/:id` | Remove friend / decline / cancel |
| `POST /v1/logout` | Revoke this session |

Limits: 200 friends, 50 pending outgoing requests, sessions last 60 days.

## Local testing
`npm run db:init:local`, create `.dev.vars` with `MODRINTH_CLIENT_SECRET=...`, then `npm run dev`.
`MODRINTH_WEB` / `MODRINTH_API` vars can point at a mock Modrinth for offline tests.
