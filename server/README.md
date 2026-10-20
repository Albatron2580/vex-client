# VEX online service

Powers **Friends**, **Collab**, news, the featured server and the **admin panel** for VEX CLIENT. Players sign in with the Minecraft account they already use in VEX — the server checks it with Mojang. Nothing to register.
It's a Cloudflare Worker with a D1 database — the free tier is plenty.

**Privacy & safety**
- Players sign in with Microsoft on Microsoft's own page inside VEX. VEX sends the server a Minecraft access token once; the server asks Mojang whose it is, keeps the name, UUID and skin link, and drops the token.
- The launcher gets a VEX session token (stored encrypted with Windows DPAPI). The server stores only a SHA-256 hash of it.
- Only friends see each other's online status. Search shows name + picture only.

## Easiest: double-click **`Set up VEX online.bat`**
It installs what's needed, signs you in to Cloudflare (click **Allow** in the browser), creates the database,
deploys, and points VEX at your new service. If anything stops, fix it and double-click again — finished steps are skipped.

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
3. Open `https://vex-online.<your-name>.workers.dev/` — you should see `{"service":"vex-online","ok":true}`.


## Connect the launcher
- **For everyone (recommended):** put the address in `launcher/electron/config.ts` → `DEFAULT_ONLINE_URL`, then publish a new VEX release. Every player gets it automatically through the updater.
- **Just for you, right now:** VEX → Settings → Account → *Online service address*.

## API (all `/v1/*` routes need `Authorization: Bearer <VEX token>`)
| Route | Does |
|---|---|
| `POST /auth/minecraft` `{token}` | Sign in with a Minecraft access token (checked with Mojang) → VEX session token |
| `GET /auth/start?port&state` | Older, optional Modrinth sign-in (needs a Modrinth app) |
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
