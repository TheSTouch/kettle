- [~] #1 Read achievements and stats
      accept: `swift test` passes with tests for `KettleClient.achievements()` that returns the player's achievements (name, unlock status, unlock time) and stats (name, value). The server answers `GET /steam/achievements` by calling `GetPlayerAchievements/v1` and `GetUserStatsForGame/v2` and returning both; `npm test` covers it. `docs/protocol.md` documents the endpoint.
      The official route can unlock achievements but not read them, and has no stats at all. Add both so a game can show progress and current state.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
      farm: claimed 2026-11-02T19:09:36+00:00 on linux, slot 1
