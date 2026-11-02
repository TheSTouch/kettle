- [ ] #6 Live Steam smoke test
      accept: a manual run of sign-in → ownership check → achievement read → achievement unlock → cloud list completes against live Steam with a real publisher key on a test app. Bugs found are fixed and their regression tests pass the gate. The README status line no longer says "tested against fakes of Steam."
      The library and server have never talked to real Steam. This is the validation step before any studio ships it.
      from: preparation, stage backlog, signed 2026-11-02 by owner; read .farm/preparation/
