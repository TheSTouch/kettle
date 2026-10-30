# Kettle

Let players who own your game on Steam play your iOS version: Steam sign-in, the ownership
check and achievements for iPhone and iPad games, plus a small server you run.

> Kettle is an independent open-source project. It is not made, endorsed or supported by
> Valve. "Steam" is a trademark of Valve Corporation.

**Status: early.** The Swift library and the server are tested against fakes of Steam; they
have not yet run against live Steam with a real publisher key. Try it on a test app first,
and please [open an issue](../../issues) with what you find.

## How it fits together

```
your game (iOS)                       your server                          Steam
  Kettle  ── sign-in, ownership ──▶   server/ (holds your publisher key) ──▶ steamcommunity.com (OpenID)
                                                                          ──▶ partner.steam-api.com
```

- **`Kettle`** (Swift package, iOS 15+): `KettleClient` signs the player in through Steam in
  a system sheet and asks your server whether they own the game; `UnlockGate` unlocks the
  game for a player who bought it in the app **or** owns it on Steam.
- **`server/`** (TypeScript, no runtime dependencies): the endpoints the app talks to, on
  web-standard `Request`/`Response`, so it runs on Node, Cloudflare Workers, Deno or Bun.
  Your Steam publisher Web API key stays there; the app never sees it.
- **`KettleExperimental`** (C / Objective-C): a reimplemented Steam client for what Steam's
  web APIs do not offer (Steam Cloud, tickets). Each of its parts is a package trait, so a
  game builds in only the parts it wants. Not endorsed by Valve; read
  [its README](Sources/KettleExperimental/README.md) first.

The wire protocol between the app and the server is [docs/protocol.md](docs/protocol.md).

## App Store

Apple lets an app honour a purchase made in another store only when the same thing can be
bought in the app. So Steam is a second way in, never the only one: sell the unlock as an
in-app purchase and let Steam owners unlock for free. `UnlockGate` does exactly that.
[docs/app-store.md](docs/app-store.md) covers the rules involved, the sign-in and
account-deletion requirements, and what to tell App Review.

## Quick start

**1. Run the server** ([server/README.md](server/README.md)):

```sh
cd server && npm install
KETTLE_BASE_URL=https://api.example.com/kettle KETTLE_APP_ID=480 \
STEAM_PUBLISHER_KEY=... KETTLE_SESSION_SECRET=$(openssl rand -base64 48) \
KETTLE_REDIRECT_URIS=mygame://kettle node example.ts
```

**2. Add the package** to your game: `https://github.com/TheSTouch/kettle`, product `Kettle`.

**3. Unlock:**

```swift
import Kettle

let kettle = KettleClient(configuration: .init(
    serverURL: URL(string: "https://api.example.com/kettle")!,
    redirectURI: URL(string: "mygame://kettle")!))
let gate = UnlockGate(productID: "com.example.mygame.unlock", kettle: kettle)

switch await gate.status() {
case .unlocked: startTheGame()
case .locked: showUnlockScreen()   // "Buy" → UnlockGate.purchase(...), "I own it on Steam" → kettle.signIn()
}

// Later, in the game:
try await kettle.unlockAchievements(["ACH_WIN_ONE_GAME"])
```

A Steam owner who lost the network keeps playing for 30 days after their last good check
(`offlineGrace`).

## Before you ship

- Read [docs/valve.md](docs/valve.md): what to ask Valve, where the publisher key lives.
- Rate-limit `/steam/token` and `/steam/achievements` at your edge.
- Add a "delete my account" control that calls `kettle.deleteAccount()`.

## Developing

```sh
swift test                         # the Swift library and the experimental module
swift test --enable-all-traits     # the same with every experimental part built in
cd server && npm test && npm run typecheck
```

## Licence

MIT, see [LICENSE](LICENSE). `KettleExperimental` comes from
[Mac-To-iOS-Recomp](https://github.com/TheSTouch/Mac-To-iOS-Recomp)'s Steam runtime, by the
same author, and is MIT here.
