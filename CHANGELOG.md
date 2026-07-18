# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-18

Initial release.

### Added

- **Milestone engine** — coalesced, monotonic, debounced, rate-limited progress
  milestones with stall detection, rolling-window ETA, and terminal states
  (`complete` / `failed` / `cancelled`) that each fire exactly once.
- **Watchers** — `script` (wrap any command), `http` (poll until healthy),
  `port` (TCP connect), `log` (tail + regex progress), `pid` (lifecycle), and
  `compose` (weighted aggregate with all-of / any-of completion).
- **Notifiers** — macOS native (Swift helper → `terminal-notifier` →
  `osascript` fallback chain), terminal event log, and opt-in remote sinks
  (`ntfy.sh`, generic webhook, Slack). Fan-out delivery with isolated failures.
- **CLI** — `nag run`, `nag until`, `nag tail`, `nag pid`, `nag serve`,
  `nag status`, `nag test-notify`; `nagger` and `nag` are interchangeable.
- **Daemon** — composite watches over a local newline-delimited JSON-RPC unix
  socket (the seam for a Phase 2 menu bar client), with in-memory state
  mirrored to a single JSON file.
- **Config** — Zod-validated `nagger.config.ts` via `defineConfig`.
- **Packaging** — pnpm + Turborepo monorepo (`core`, `notify`, `daemon`,
  `nagger`), single-file binary via `bun build --compile`, Homebrew tap
  formula, and GitHub Actions CI (lint, typecheck, test, audit, binary build)
  across Ubuntu and macOS.
