# KettleExperimental

A Steam client in plain C and Objective-C: it logs on to Steam's connection managers over
a WebSocket as the player, the way the Steam client does, following the protocol as
SteamKit2 and node-steam-user document it. It gives what Steam's web APIs do not: Steam
Cloud files, app ownership and auth session tickets, presence, any unified service method.

**Not endorsed by Valve.** Steam can change this protocol at any time and break every game
that ships this module, and Valve may object to a game signing in as a Steam client. Ask
Valve (Steamworks support) before shipping it in a store build; the `Kettle` library is the
route built on Steam's documented APIs. See [docs/valve.md](../../docs/valve.md).

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

Steam lets an account play one game at a time. When the account is playing elsewhere,
`RecompSteam_PlayingBlocked` says so; `RecompSteam_KickPlayingSession` ends the other game,
so call it only when the player chose to.
