# Valve's side

Kettle is not made, endorsed or supported by Valve. "Steam" and the Steam logo are Valve's
trademarks; this page is what a studio should know and ask before shipping.

## The official route (`Kettle` + `server/`)

Built only on Steam's documented APIs:

| What | API |
|---|---|
| Sign-in | [Sign in through Steam](https://partner.steamgames.com/doc/features/auth#website) (OpenID 2.0, `steamcommunity.com/openid/login`) |
| Ownership | `ISteamUser/CheckAppOwnership/v2` on `partner.steam-api.com` |
| Achievements | `ISteamUserStats/SetUserStatsForGame/v1` on `partner.steam-api.com` |

Both partner calls need your **publisher Web API key** (Steamworks → Users & Permissions →
Manage Groups). It only ever lives on your server: never in the app, never in a repository.
Anyone with it can act on your game's players.

For the sign-in button, use Valve's own "Sign in through Steam" images and follow Valve's
branding rules; Kettle does not ship them.

## Questions to ask Valve first

1. **Free iOS copies for Steam owners.** Giving players who own the game on Steam a free
   unlock on iOS is your call as the publisher, but ask Steamworks support whether your
   Steam distribution agreement says anything about it.
2. **The experimental module.** `KettleExperimental` signs the player in as a Steam client
   on Steam's own connection protocol (as SteamKit2 does). Valve does not document or
   support this protocol for third parties and can change it at any time. Ask before
   shipping it in a store build.
3. **Steam Cloud.** There is no documented web API for Steam Cloud from another platform;
   the experimental module is the only way Kettle offers today.

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
