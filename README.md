# Kettle

Let players who own your game on Steam play your iOS version: Steam sign-in, the ownership
check and achievements for iPhone and iPad games, plus a small server you run.

> Kettle is an independent open-source project. It is not made, endorsed or supported by
> Valve. "Steam" is a trademark of Valve Corporation; see Valve's
> [Steam brand guidelines](https://partner.steamgames.com/doc/marketing/branding) and the
> [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms), which forbid making
> an application appear endorsed by or affiliated with Valve.

**Status: early.** The Swift library and the server are tested against fakes of Steam; they
have not yet run against live Steam with a real publisher key. `KettleExperimental` has run
against live Steam: it is the Steam runtime of four games in Mac-To-iOS-Recomp, tested on an
iPad (see [Used in Mac-To-iOS-Recomp](#used-in-mac-to-ios-recomp)). Try it on a test app
first, and please [open an issue](../../issues) with what you find.

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
- **`KettleExperimental`** (C / Objective-C): a reimplemented Steam client for what the
  official route does not offer: auth session tickets, which only a Steam client makes, and
  Steam Cloud, which Valve's [`ICloudService`](https://partner.steamgames.com/doc/webapi/ICloudService)
  Web API also covers through Steam OAuth but Kettle does not implement yet. Each of its parts is a package trait, so a
  game builds in only the parts it wants. Not endorsed by Valve; read
  [its README](Sources/KettleExperimental/README.md) first.

The wire protocol between the app and the server is [docs/protocol.md](docs/protocol.md).

## Used in Mac-To-iOS-Recomp

[Mac-To-iOS-Recomp](https://github.com/TheSTouch/Mac-To-iOS-Recomp) ports Mac games to iPad
and iPhone. It builds the Steam runtime of every port from `KettleExperimental` v0.1.0 (a git
submodule, with the `KETTLE_CONCURRENT_PLAY` part built in and left on Deny), since its
[pull request #5](https://github.com/TheSTouch/Mac-To-iOS-Recomp/pull/5). One round of
testing on an iPad, on 2026-10-30, gave:

| Game | Engine | Sign-in | Licence check | Cloud saves | Achievements | Online play |
|---|---|---|---|---|---|---|
| Timberborn | Unity | works | works | upload works; download not tested | partial: read; no unlock seen in play | not in the game |
| Valheim | Unity | works | works, DLC included | upload works; download not tested | partial: read; setting one went through, but it was already unlocked | works: joined a password-protected Steam server by IP |
| Brawlhalla | Adobe AIR | works | works | not used by the port | partial: read | not in the port; its encrypted app ticket works |
| Stray | Unreal | works | works | partial: the sync ran but uploaded no files | not in Unreal ports yet | not in the game |

- **Cloud download** needs a save changed from another device first, so it was not tested.
- **The account playing on another device** was tested only with Timberborn: Steam logged
  the session off (`LoggedInElsewhere`), it tried again after two minutes, and the game
  played on in its offline grace. Steam logs the session off before the ownership ticket
  comes, so the "Play here" prompt did not show. The old copy did the same.

## App Store

> **Our reading, not legal advice.** This summarises Apple's and Valve's rules as we understand them. It may contain mistakes or be out of date: rely only on the official documents linked here, not on our description.

Apple lets an app honour a purchase made on another platform only when the same thing can
be bought in the app ([App Review Guidelines 3.1.3(b)](https://developer.apple.com/app-store/review/guidelines/#3.1.3b)),
and requires in-app purchase to unlock a full version ([3.1.1](https://developer.apple.com/app-store/review/guidelines/#3.1.1)).
So Steam is a second way in, never the only one: sell the unlock as an in-app purchase and
let Steam owners unlock for free. `UnlockGate` does exactly that.
[docs/app-store.md](docs/app-store.md) covers the rules involved, the sign-in
([4.8](https://developer.apple.com/app-store/review/guidelines/#4.8)) and account-deletion
([5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#5.1.1v)) requirements,
and what to tell App Review.

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

- Read [docs/valve.md](docs/valve.md): what to ask Valve, where the publisher key lives,
  and what Valve's [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/)
  and [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) say.
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
