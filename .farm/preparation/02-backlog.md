# Its backlog

Role: intake. Version 2, signed 2026-11-02T18:49:47Z by owner.

# Its backlog

- [ ] Read achievements and stats
  accept: `swift test` passes with tests for `KettleClient.achievements()` that returns the player's achievements (name, unlock status, unlock time) and stats (name, value). The server answers `GET /steam/achievements` by calling `GetPlayerAchievements/v1` and `GetUserStatsForGame/v2` and returning both; `npm test` covers it. `docs/protocol.md` documents the endpoint.
  The official route can unlock achievements but not read them, and has no stats at all. Add both so a game can show progress and current state.

- [ ] DLC ownership
  accept: `swift test` passes with tests for `KettleClient.ownership(appID:)` that checks ownership of a specific app ID (DLC or another game). The server answers `GET /steam/ownership?app_id=<id>` by calling `CheckAppOwnership` for that ID; `npm test` covers it. `docs/protocol.md` documents the parameter.
  `CheckAppOwnership` already works per app ID. Expose it so a game can check DLC or related titles without a second server.

- [ ] Upgrade CheckAppOwnership to v4
  accept: `swift test` and `npm test` pass. The server calls `ISteamUser/CheckAppOwnership/v4` instead of v2. Any new fields v4 returns that are useful (site licence, timed trial) are included in the ownership response and documented in `docs/protocol.md`.
  Valve's current version is v4; Kettle calls v2. Use the current API before studios ship against it.

- [ ] Official Steam Cloud through ICloudService
  accept: `swift test` passes with tests for `KettleClient.cloudFiles()`, `.downloadCloudFile(_:)` and `.uploadCloudFile(_:data:)` that list, download and upload Steam Cloud files through the server. The server implements the endpoints using Steam's documented `ICloudService` Web API with Steam OAuth; `npm test` covers them. `docs/protocol.md` documents the endpoints. This route does not need `KettleExperimental`.
  Multiple docs note "Kettle does not implement it yet." This adds the documented route for cloud saves so a game does not need the experimental module for them.

- [ ] CI: run the gate on every push
  accept: a GitHub Actions workflow in `.github/workflows/` runs `swift test` and `cd server && npm test && npm run typecheck` on every push and pull request. A failing check blocks merge.
  The repo has no CI. The gate exists but only runs locally.

- [ ] Live Steam smoke test
  accept: a manual run of sign-in → ownership check → achievement read → achievement unlock → cloud list completes against live Steam with a real publisher key on a test app. Bugs found are fixed and their regression tests pass the gate. The README status line no longer says "tested against fakes of Steam."
  The library and server have never talked to real Steam. This is the validation step before any studio ships it.
