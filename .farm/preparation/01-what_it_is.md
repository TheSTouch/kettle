# What it is

Role: intake. Version 2, signed 2026-11-02T18:31:54Z by owner.

# What it is

Kettle is a Swift library that lets developers add a Steam client to their iOS or iPad game: Steam sign-in, an ownership check, achievements and optionally cloud saves and auth tickets, through a small server the studio runs. Players who bought the game on Steam can unlock the iOS version without buying it again.

## What it is built with

- **Swift 6.1** (swift-tools-version 6.1, language mode v5), targeting iOS 15+ and macOS 12+. The `Kettle` library is pure Swift; `KettleExperimental` is C and Objective-C inside the same Swift package.
- **TypeScript 5.9+** on Node 22.18+ for the reference server (`server/`), with no runtime dependencies. It also runs on Cloudflare Workers, Deno and Bun.

## How it builds and tests

**Swift library and experimental module:**

```sh
swift test
```

Builds both `Kettle` and `KettleExperimental` and runs their test targets. `swift test --enable-all-traits` includes every optional experimental part.

**Server:**

```sh
cd server && npm install && npm test && npm run typecheck
```

Runs the server's Node test runner and checks types with `tsc --noEmit`.

## Gate

```sh
swift test
```

The gate runs the Swift tests. The server has its own tests but the gate is the Swift package: it is the unit that lands together and that a broken change must not pass.

## project.yml

```yaml
test: swift test
tech:
  - swift
  - typescript
  - c
  - objective-c
```
