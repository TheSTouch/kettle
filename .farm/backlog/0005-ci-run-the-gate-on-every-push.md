- [ ] #5 CI: run the gate on every push
      accept: a GitHub Actions workflow in `.github/workflows/` runs `swift test` and `cd server && npm test && npm run typecheck` on every push and pull request. A failing check blocks merge.
      The repo has no CI. The gate exists but only runs locally.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
