- [ ] #2 DLC ownership
      accept: `swift test` passes with tests for `KettleClient.ownership(appID:)` that checks ownership of a specific app ID (DLC or another game). The server answers `GET /steam/ownership?app_id=<id>` by calling `CheckAppOwnership` for that ID; `npm test` covers it. `docs/protocol.md` documents the parameter.
      `CheckAppOwnership` already works per app ID. Expose it so a game can check DLC or related titles without a second server.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
