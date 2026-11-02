- [ ] #4 Official Steam Cloud through ICloudService
      accept: `swift test` passes with tests for `KettleClient.cloudFiles()`, `.downloadCloudFile(_:)` and `.uploadCloudFile(_:data:)` that list, download and upload Steam Cloud files through the server. The server implements the endpoints using Steam's documented `ICloudService` Web API with Steam OAuth; `npm test` covers them. `docs/protocol.md` documents the endpoints. This route does not need `KettleExperimental`.
      Multiple docs note "Kettle does not implement it yet." This adds the documented route for cloud saves so a game does not need the experimental module for them.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
