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
