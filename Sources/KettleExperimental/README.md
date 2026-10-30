# KettleExperimental

A Steam client in plain C and Objective-C: it logs on to Steam's connection managers over
a WebSocket as the player, the way the Steam client does, following the protocol as
SteamKit2 and node-steam-user document it. It gives what Kettle's official route does not:
app ownership and auth session tickets, presence, any unified service method, and Steam
Cloud files (Valve also documents [`ICloudService`](https://partner.steamgames.com/doc/webapi/ICloudService),
a Web API for them through Steam OAuth, which Kettle does not implement yet).

> **Our reading, not legal advice.** This summarises Apple's and Valve's rules as we understand them. It may contain mistakes or be out of date: rely only on the official documents linked here, not on our description.

**Not endorsed by Valve.** Steam can change this protocol at any time and break every game
that ships this module, and Valve may object to a game signing in as a Steam client: the
[Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) let Valve suspend or
end a developer's access "at any time for any reason, without notice", and the
[Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/) governs
the player's account. Ask Valve (Steamworks support) before shipping it in a store build;
the `Kettle` library is the route built on Steam's
[documented APIs](https://partner.steamgames.com/doc/features/auth). See
[docs/valve.md](../../docs/valve.md).

## Where it comes from

These files are the Steam runtime of [Mac-To-iOS-Recomp](https://github.com/TheSTouch/Mac-To-iOS-Recomp)
(`recomp/native/RecompSteam`, as of its commit `8721478`), where it runs Valheim, Timberborn
and other ports on iPad and iPhone. Only the session, the sign-in, the protobuf codec and the
Steam Cloud protocol are here; the Steamworks API those ports serve on top is not. The names
keep their `RecompSteam` prefix so fixes can move between the two copies.

| Header | What |
|---|---|
| `RecompSteamSession.h` | the logon, state, messages, unified service calls, presence, ownership and auth tickets |
| `RecompSteamAuth.h` | signing in as a Steam client: QR code (approved in the Steam Mobile app) or account name, password and Steam Guard |
| `RecompSteamProto.h` | a small protobuf writer and reader, no generated code |
| `RecompSteamCloud.h` | Steam Cloud: list, download, upload a batch of files |

Every completion runs on the session's own serial queue (`RecompSteam_Queue()`); hop to
the main queue for UI.

## Choosing the parts

Each part beyond the session is a package trait, so a game that does not want one leaves its
code out of the app entirely (calling a function of a part left out fails to link):

| Trait | Default | What |
|---|---|---|
| `SignIn` | on | signing in as a Steam client: QR code, or account name, password and Steam Guard |
| `Cloud` | on | Steam Cloud: list, download, upload |
| `Tickets` | on | app ownership and auth session tickets |
| `ConcurrentPlay` | **off** | `RecompSteam_SetConcurrentPlay`: Steam beside another device ([below](#playing-on-two-devices-at-once)) |

The session, the protobuf codec and the token helpers are always built. Pick the traits
where you add the package (Swift 6.1 or later):

```swift
.package(url: "https://github.com/TheSTouch/kettle", from: "0.1.0",
         traits: ["Cloud"])                                // only Steam Cloud
.package(url: "https://github.com/TheSTouch/kettle", from: "0.1.0",
         traits: [.defaults, "ConcurrentPlay"])           // the defaults, plus concurrent play
```

Built outside SwiftPM, the files take the same defaults; define
`KETTLE_EXPERIMENTAL_CONFIGURED` and then `KETTLE_SIGN_IN`, `KETTLE_CLOUD`,
`KETTLE_TICKETS` or `KETTLE_CONCURRENT_PLAY` to choose (`KettleFeatures.h`).

## Using it from an app

```swift
import KettleExperimental

// Once: sign in. QR is the better choice in an app: the password never touches it.
RecompSteamAuth_BeginQR("My Game on iPad", 0, { url in
    // show url as a QR code; the player scans it with the Steam Mobile app
}, nil) { eresult, refresh, _, _ in
    guard eresult == RecompSteamResultOK, let refresh else { return }
    // Keep String(cString: refresh) in the Keychain yourself.
}

// Each launch: log on with the kept token.
RecompSteam_Start(refreshToken, appID, "My Game on iPad")
RecompSteam_WhenLoggedOn(10) { loggedOn in /* ... */ }
```

On iOS, `RecompSteamAuth_StoredToken` reads the Keychain item the Mac-To-iOS-Recomp ports
write, and `RecompSteamAuth_StoreToken` does nothing: an app keeps its own refresh token
and passes it to `RecompSteam_Start`.

## Playing on two devices at once

Steam lets an account play one game at a time. When the account is playing elsewhere,
`RecompSteam_PlayingBlocked` says so; `RecompSteam_KickPlayingSession` ends the other game,
so call it only when the player chose to.

`RecompSteam_SetConcurrentPlay` (the `ConcurrentPlay` trait, off by default) decides what the
session does meanwhile; without the trait the session is always Deny. **Deny**, the
default, is the Steam client's way: the game asks the player to play here or go without
Steam. **Allow** keeps Steam Cloud, stats and achievements and tickets working while the
account plays elsewhere, without ending the other game and without claiming this one until
the other ends. Allow is **not yet tested against live Steam**, and it is the studio's
decision and risk: the [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/)
says an account is strictly personal ([section 1](https://store.steampowered.com/subscriber_agreement/#1))
and lets Valve restrict or cancel an account that breaches it
([section 9](https://store.steampowered.com/subscriber_agreement/#9)), and the
[Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) let Valve end a
developer's access at any time. Read [docs/valve.md, "Playing on two devices at once"](../../docs/valve.md#playing-on-two-devices-at-once)
before choosing it.
