# Valve's side

> **Our reading, not legal advice.** This summarises Apple's and Valve's rules as we understand them. It may contain mistakes or be out of date: rely only on the official documents linked here, not on our description.

Kettle is not made, endorsed or supported by Valve. "Steam" and the Steam logo are Valve's
trademarks ([Steam brand guidelines](https://partner.steamgames.com/doc/marketing/branding));
this page is what a studio should know and ask before shipping. The texts it draws on are
the [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/),
the [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) and Steamworks'
[User Authentication and Ownership](https://partner.steamgames.com/doc/features/auth).

## The official route (`Kettle` + `server/`)

Built only on Steam's documented APIs:

| What | API |
|---|---|
| Sign-in | [Sign in through Steam](https://partner.steamgames.com/doc/features/auth#website) (OpenID 2.0, `steamcommunity.com/openid/login`) |
| Ownership | [`ISteamUser/CheckAppOwnership/v2`](https://partner.steamgames.com/doc/webapi/ISteamUser#CheckAppOwnership) on `partner.steam-api.com` |
| Achievements | [`ISteamUserStats/SetUserStatsForGame/v1`](https://partner.steamgames.com/doc/webapi/ISteamUserStats#SetUserStatsForGame) on `partner.steam-api.com` |

Valve's current version of `CheckAppOwnership` is v4; Kettle calls v2, whose `ownsapp` and
`ownersteamid` are the fields it reads. Both partner calls need your **publisher Web API
key** ("the publisher API key that owns the specified App ID"), and Valve says they must be
called from a secure server, never from a client (Steamworks → Users & Permissions →
Manage Groups). It only ever lives on your server: never in the app, never in a repository.
Anyone with it can act on your game's players. The
[Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) also ask you to keep
your key confidential and not to share it with any third party (section 2).

**Steam Families.** A game borrowed through [Steam Families](https://partner.steamgames.com/doc/features/families)
counts as owned for `CheckAppOwnership` (`ownsapp` is true), with `ownersteamid` naming the
lender and `permanent` false: Valve calls such licences temporary. The reference server
treats a borrowed game as not owned unless you set `KETTLE_ALLOW_FAMILY_SHARING`.

**The sign-in button.** Valve asks sites using its OpenID provider to use one of its
"Sign in through Steam" buttons, from [steamcommunity.com/dev](https://steamcommunity.com/dev);
Kettle does not ship them. The [Steam brand guidelines](https://partner.steamgames.com/doc/marketing/branding)
say the Steam logo may not be used in any way that implies non-Valve materials are
sponsored or endorsed by Valve, and that the Steam trademarks may not be primary or
prominent features of non-Valve materials.

## Questions to ask Valve first

1. **Free iOS copies for Steam owners.** Giving players who own the game on Steam a free
   unlock on iOS is your call as the publisher, but ask Steamworks support whether your
   Steam distribution agreement says anything about it.
2. **The experimental module.** `KettleExperimental` signs the player in as a Steam client
   on Steam's own connection protocol (as SteamKit2 does). Valve does not document or
   support this protocol for third parties and can change it at any time. Ask before
   shipping it in a store build.
3. **Steam Cloud.** Valve documents a Web API for exactly this:
   [`ICloudService`](https://partner.steamgames.com/doc/webapi/ICloudService) lets the
   non-Steam versions of a game list, download and upload the player's Steam Cloud files,
   once the player gave the game permission through Steam OAuth (`read_cloud` and
   `write_cloud`). Kettle does not implement it yet; ask Valve how to get OAuth access for
   your game. Until then the experimental module is the only Steam Cloud route Kettle
   offers.

## Playing on two devices at once

Steam lets an account play one game at a time. When the account plays on a PC and the
iOS game starts, the Steam client on either side offers to end the other game. Neither
`Kettle` route ends it on its own.

**The official route** (`Kettle` + `server/`) has no playing session at all: it signs the
player in through a web page and asks Steam's Web API whether the account owns the game.
Steam is never told the account plays on iOS, so nothing there enforces one game at a time,
and there is nothing to configure.

**The experimental module** logs on as a Steam client, so Steam does know. Its setting
`RecompSteam_SetConcurrentPlay` decides what happens when the account already plays
elsewhere. It is built only into games that turn on the package's `ConcurrentPlay` trait;
without it, the session is always Deny.

- **Deny, the default:** the module behaves like the Steam client. `RecompSteam_PlayingBlocked`
  tells the game, and the game offers "Play here" (`RecompSteam_KickPlayingSession`, which
  ends the other game) or carries on without Steam.
- **Allow:** the module stays logged on for Steam Cloud, stats and achievements and tickets,
  without ending the other game and without telling Steam the account plays here while it
  plays elsewhere. Steam may still refuse some of those calls on its side. **Not yet tested
  against live Steam.**

What Valve's texts say, as we read them:

- The [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/)
  (the version of September 10, 2026) has no clause about playing on two devices at once and
  no limit on how many devices an account uses. One game at a time is how Steam works, not
  a sentence in the agreement.
- It does say that an account is personal: "Your Account ... is strictly personal" and you
  "may not reveal, share or otherwise allow others to use your password or Account"
  ([section 1, Registration as a Subscriber; Application of Terms to You; Your Account](https://store.steampowered.com/subscriber_agreement/#1)).
  Its licence to games is "for your personal, non-commercial use"
  ([section 2, Licenses](https://store.steampowered.com/subscriber_agreement/#2)). One player
  on their PC and their iPad is a different case from two people sharing one account, but
  Allow cannot tell them apart.
- What Valve can do to an account: "Valve may restrict or cancel your Account or any
  particular Subscription(s)" when "you breach any terms of this Agreement"
  ([section 9, Term and Termination](https://store.steampowered.com/subscriber_agreement/#9)).
- What Valve can do to a publisher: the
  [Steam Web API Terms of Use](https://steamcommunity.com/dev/apiterms) let Valve suspend
  or end a developer's access to the Web API "at any time for any reason, without notice"
  (sections 1 and 11). The Steamworks distribution agreement between Valve and the studio
  is not public; we have not read it, and nothing public we found says what Valve does
  about a game that lets accounts play on two devices at once. Ask Steamworks support.

So Allow is **the studio's decision and its risk**, and Deny is the default.
