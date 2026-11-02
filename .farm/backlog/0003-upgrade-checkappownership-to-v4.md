- [ ] #3 Upgrade CheckAppOwnership to v4
      accept: `swift test` and `npm test` pass. The server calls `ISteamUser/CheckAppOwnership/v4` instead of v2. Any new fields v4 returns that are useful (site licence, timed trial) are included in the ownership response and documented in `docs/protocol.md`.
      Valve's current version is v4; Kettle calls v2. Use the current API before studios ship against it.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
