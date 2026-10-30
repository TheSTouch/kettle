# Kettle reference server

The studio's side of Kettle: "Sign in through Steam" for the iOS game, the ownership check and
achievement unlocks, with the Steam publisher Web API key kept here and never in the app. It
implements [the Kettle protocol](../docs/protocol.md) and stores nothing.

It is one function on web-standard `Request` and `Response` with no runtime dependencies, so it
runs on Node, Cloudflare Workers, Deno and Bun.

| Endpoint | |
|---|---|
| `GET /steam/start` | sends the player to Steam's sign-in |
| `GET /steam/callback` | Steam's answer; checked with Steam, then back to the app with a one-time code |
| `POST /steam/token` | trades the code (and its PKCE verifier) for a 30-day session token |
| `GET /steam/ownership` | whether the signed-in account owns the game |
| `POST /steam/achievements` | unlocks achievements by API name |
| `DELETE /steam/account` | forgets the link (nothing to forget here; add your own if you store the Steam ID) |

## Run it on Node

Node 22.18 or later runs the TypeScript as it is.

```sh
cd server
KETTLE_BASE_URL=https://api.example.com/kettle \
KETTLE_APP_ID=480 \
STEAM_PUBLISHER_KEY=... \
KETTLE_SESSION_SECRET="$(openssl rand -base64 48)" \
KETTLE_REDIRECT_URIS=mygame://kettle \
node example.ts
```

`KETTLE_BASE_URL` is the public URL players reach, the one Steam sends them back to; put the
server behind HTTPS. `KETTLE_ALLOW_FAMILY_SHARING=true` counts games borrowed through
[Steam Families](https://partner.steamgames.com/doc/features/families) as owned (off by
default: Valve calls those licences temporary, and the iOS copy is a separate product). `PORT` defaults to 8787.

In your own Node server:

```ts
import { createKettle } from "./src/kettle.ts";
import { serve } from "./src/node.ts";

const kettle = createKettle({
  baseURL: "https://api.example.com/kettle",
  appId: 480,
  publisherKey: process.env.STEAM_PUBLISHER_KEY!,
  sessionSecret: process.env.KETTLE_SESSION_SECRET!,
  redirectURIs: ["mygame://kettle"],
});
serve(kettle, { port: 8787 });
```

Or call `kettle.handle(request)` from any framework that speaks `Request`/`Response` (Hono,
Next.js route handlers, ...).

## Deploy on Cloudflare Workers

```ts
import { createKettle } from "./src/kettle.ts";

export default {
  fetch(request: Request, env: Record<string, string>) {
    return createKettle({
      baseURL: env.KETTLE_BASE_URL,
      appId: Number(env.KETTLE_APP_ID),
      publisherKey: env.STEAM_PUBLISHER_KEY,
      sessionSecret: env.KETTLE_SESSION_SECRET,
      redirectURIs: env.KETTLE_REDIRECT_URIS.split(","),
    }).handle(request);
  },
};
```

Keep `STEAM_PUBLISHER_KEY` and `KETTLE_SESSION_SECRET` as secrets (`wrangler secret put`), not
plain variables.

## Security notes

> **Our reading, not legal advice.** This summarises Apple's and Valve's rules as we understand them. It may contain mistakes or be out of date: rely only on the official documents linked here, not on our description.

- **The publisher key stays here.** It can change anything about your game on Steam. Valve
  says the partner calls that need it ([`CheckAppOwnership`](https://partner.steamgames.com/doc/webapi/ISteamUser#CheckAppOwnership),
  [`SetUserStatsForGame`](https://partner.steamgames.com/doc/webapi/ISteamUserStats#SetUserStatsForGame))
  must be made from a secure server and never from a client, and the
  [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) ask you to keep your key
  confidential (section 2). It is never logged or sent back, in errors either; keep it out of
  your own logs too.
- **The session secret** is at least 32 random bytes. It signs every sign-in state, code and
  session token. Rotating it signs every player out, which is also how to revoke all sessions.
- **Rate-limit** `/steam/token` and `/steam/achievements` at your edge (per IP and per token).
  The server does not: it keeps no state. The Steam Web API Terms of Use also say "You are
  limited to one hundred thousand (100,000) calls to the Steam Web API per day" (section 2).
- **Redirect URIs** are matched exactly. List only your game's own scheme.
- **Achievements** are trusted from the game, as Steam trusts the game on PC.
- **Account deletion.** If you store the Steam ID, delete it in `DELETE /steam/account`: Apple
  requires in-app account deletion when an app supports account creation
  ([App Review Guidelines 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#5.1.1v)).

## Tests

```sh
npm install
npm run typecheck
npm test
```
