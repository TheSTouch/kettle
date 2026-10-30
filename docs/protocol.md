# The Kettle protocol

What the iOS library (`Sources/Kettle`) and the studio's server (`server/`) say to each
other. Both are built from this page; a change here is a change to both.

The server is the studio's own. It holds the Steam publisher Web API key and a session
secret, talks to Steam, and stores nothing in the reference implementation. The app never
sees the publisher key.

All paths are relative to the server's base URL (`https://api.example.com/kettle` below).
Steam IDs are always strings: a SteamID64 does not fit a JavaScript number. Times are Unix
seconds. Errors are JSON:

```json
{ "error": "invalid_request", "message": "redirect_uri is not allowed" }
```

For every endpoint: a body that is not JSON answers `400` `invalid_request`; an unknown path
`404` `not_found`; a known path with another method `405` `method_not_allowed` with an
`Allow` header; anything unexpected `500` `server_error`. `401` answers carry
`WWW-Authenticate: Bearer`.

## Sign-in

Steam's "Sign in through Steam" is OpenID 2.0. The app opens it in an
`ASWebAuthenticationSession`, the server checks Steam's answer, and the app trades a
one-time code for a session token, PKCE style (RFC 7636, S256), so a code caught on its way
to the app is useless without the verifier the app kept.

```
app                         studio server                      steamcommunity.com
 |  GET /steam/start ---------->|                                      |
 |                              |-- 302 openid checkid_setup --------->|
 |                              |                      player signs in |
 |                              |<-- GET /steam/callback?state&openid.*|
 |                              |-- POST check_authentication -------->|
 |                              |<-- is_valid:true --------------------|
 |<-- 302 redirect_uri?code ----|                                      |
 |  POST /steam/token --------->|                                      |
 |<-- { token, steam_id } ------|                                      |
```

### `GET /steam/start`

| Query | |
|---|---|
| `redirect_uri` | where the app wants the answer, e.g. `mygame://kettle`. Must equal one of the server's allowed redirect URIs exactly. |
| `code_challenge` | base64url (no padding) of SHA-256 of the verifier, 43 characters |
| `code_challenge_method` | `S256` (the only one) |

Answers `302` to `https://steamcommunity.com/openid/login` with:

```
openid.ns         = http://specs.openid.net/auth/2.0
openid.mode       = checkid_setup
openid.return_to  = <base>/steam/callback?state=<state>
openid.realm      = <origin of base>
openid.identity   = http://specs.openid.net/auth/2.0/identifier_select
openid.claimed_id = http://specs.openid.net/auth/2.0/identifier_select
```

`state` is a signed value (see [Signed values](#signed-values)) of kind `state` holding the
redirect URI and the challenge, valid 10 minutes. A bad request answers `400`
`invalid_request`.

### `GET /steam/callback`

Steam sends the player's browser here. The server accepts the sign-in only when all hold:

1. `state` is a valid, unexpired `state` value;
2. `openid.mode` is `id_res`;
3. `openid.op_endpoint` is `https://steamcommunity.com/openid/login`;
4. `openid.return_to` is exactly `<base>/steam/callback?state=<state>` (this request);
5. `openid.claimed_id` matches `^https://steamcommunity\.com/openid/id/(7656119\d{10})$`;
6. `openid.signed` lists `op_endpoint`, `claimed_id`, `identity` and `return_to`: Steam's
   check below only vouches for signed fields, so an unsigned `claimed_id` could be swapped;
7. Steam answers `is_valid:true` to a `POST` of the same `openid.*` fields with
   `openid.mode=check_authentication`.

Then it answers `302` to `<redirect_uri>?code=<code>`, where `code` is a signed value of kind
`code` holding the Steam ID and the challenge, valid 2 minutes.

When the state is valid but the sign-in is not: `302` to `<redirect_uri>?error=<error>`,
`access_denied` when the player cancelled (`openid.mode=cancel`), `server_error` when Steam
could not be reached, `invalid_request` otherwise. When the state itself is bad there is
nowhere safe to send the player: `400` `invalid_request`.

### `POST /steam/token`

```json
{ "code": "<code>", "code_verifier": "<verifier>" }
```

The code must be a valid, unexpired `code` value whose challenge is
`base64url(SHA-256(code_verifier))`. Answers `200`:

```json
{ "token": "<token>", "steam_id": "76561198000000000", "expires_at": 1767225600 }
```

`token` is a signed value of kind `token` holding the Steam ID, valid 30 days. A bad code
or verifier answers `400` `invalid_grant`.

## Signed-in calls

Each sends `Authorization: Bearer <token>`. A missing, malformed, forged or expired token
answers `401` `invalid_token`; the app then signs in again.

### `GET /steam/ownership`

Whether the signed-in account may play the game on this device. The server asks Steam
(`ISteamUser/CheckAppOwnership/v2` on `partner.steam-api.com`, with the publisher key) every
time; caching is the app's choice.

```json
{ "steam_id": "76561198000000000", "owns": true, "reason": "owned", "checked_at": 1764633600 }
```

| `reason` | `owns` |
|---|---|
| `owned` | `true`: the account holds a licence of its own |
| `family_shared` | the server's `allowFamilySharing` setting (default `false`): Steam lends the game, but the iOS copy is a separate product |
| `not_owned` | `false` |

Steam unreachable or refusing the key answers `502` `steam_unavailable`.

### `POST /steam/achievements`

```json
{ "names": ["ACH_WIN_ONE_GAME"] }
```

Unlocks each achievement (its API name, as set in Steamworks) with
`ISteamUserStats/SetUserStatsForGame/v1`. 1 to 50 names, each matching
`^[A-Za-z0-9_]{1,128}$`, else `400` `invalid_request`. Answers `204`, or `502`
`steam_unavailable` when Steam answers with an error status. (Not yet checked against live
Steam: whether it can also report a failure inside a `200`.)

Like on Steam itself, the game is trusted to say what the player did.

### `DELETE /steam/account`

Forgets the link between this player and their Steam account. The reference server stores
nothing, so it answers `204` at once; a studio that keeps the Steam ID (for saves,
leaderboards, purchases) deletes it here. App Store guideline 5.1.1(v) needs this to exist
when the app keeps an account.

## Signed values

`state`, `code` and `token` share one format:

```
base64url(JSON payload) "." base64url(HMAC-SHA256(secret, "kettle1." + base64url(JSON payload)))
```

base64url has no padding. The payload always holds `k` (the kind: `state`, `code` or
`token`) and `e` (expiry, Unix seconds). A value of one kind is never accepted as another.

| Kind | Payload |
|---|---|
| `state` | `{ "k": "state", "e", "r": redirect_uri, "c": code_challenge }` |
| `code` | `{ "k": "code", "e", "s": steam_id, "c": code_challenge }` |
| `token` | `{ "k": "token", "e", "s": steam_id }` |

The secret is at least 32 bytes and only the server knows it. Rotating it signs every
player out.
