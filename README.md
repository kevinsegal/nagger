# Nagger

> **Process & deployment sentinel.** A CLI-first macOS tool that watches
> long-running server processes, health checks, and deployment scripts — then
> nags you with native notifications at progress milestones (every 10% by
> default) and on completion, success, or failure.

Nagger answers one question continuously: **"How far along is my thing, and is
it done?"** — without you watching a terminal. It nags so you don't have to
check.

The binary ships as `nagger` with a first-class short alias `nag`. Docs and
examples use `nag`.

```bash
nag run --label "prod deploy" -- ./deploy.sh --env prod
# ▲ prod deploy — 70% · ETA 2m 14s
# ✓ prod deploy — done in 6m 02s
```

---

## Why Nagger

- **Milestone-precise, not spammy.** One notification per 10% band. If progress
  jumps 5% → 95% in a single tick, you get **one** coalesced nag listing the
  skipped bands — never nine pings.
- **Monotonic by default.** Retries and log rollovers never re-fire milestones
  you've already passed (`--allow-regress` opts out).
- **Terminal states always fire.** `complete`, `failed` (with exit code), and
  `cancelled` (SIGINT → exit 130) each fire exactly once, even if milestones
  were silenced.
- **Works headless / over SSH.** macOS native notifications when local; ntfy,
  webhook, and Slack sinks so a deploy on a server can nag your phone.

## Install

### Homebrew (no Node required)

```bash
brew tap kevinsegal/nagger
brew install nagger      # installs both `nagger` and `nag`
```

### npm

```bash
npm install -g nagger    # requires Node 22+
```

### Verify notifications

```bash
nag test-notify
```

## Usage

```bash
nag run [--label "prod deploy"] [--step 10] -- ./deploy.sh --env prod
nag until <url|host:port> [--timeout 10m] [--expect 200] [--interval 2s]
nag tail <file> --pattern "(?<pct>\d+)%" [--step 10]
nag pid <pid|name> [--on-exit-only]
nag serve [--config nagger.config.ts]   # daemon mode for composite watches
nag status                              # live status of daemon watches
nag test-notify                         # verify notification permissions/routing
```

### Examples

```bash
# Wrap a deploy: milestones from stdout, notify on exit with the exit code.
nag run --label "prod deploy" -- ./deploy.sh --env prod

# Wait for a service to come up, then nag once with elapsed time.
nag until https://api.example.com/health --timeout 10m

# Wait for a port to open.
nag until db.internal:5432

# Tail a log and derive progress from "1234/5000 rows".
nag tail /var/log/etl.log --pattern "(?<current>\d+)/(?<total>\d+) rows"

# Notify when a running process exits.
nag pid 4242

# Fan out to your phone via ntfy while also nagging locally.
NAGGER_NTFY_TOPIC=my-deploys nag run --notify macos,ntfy -- ./deploy.sh

# Machine-readable event stream for scripting.
nag run --json -- ./deploy.sh | jq .
```

### Global flags

| Flag                  | Description                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `--label <label>`     | Human label shown in notifications                                  |
| `--step <n>`          | Milestone step in percent (default `10`)                            |
| `--silent`            | Suppress notification sounds                                        |
| `--notify <channels>` | Comma-separated sinks: `macos,ntfy,webhook,slack` (default `macos`) |
| `--json`              | Emit a newline-delimited JSON event stream to stdout                |
| `--allow-regress`     | Allow progress to regress and re-fire milestones                    |
| `--debounce <dur>`    | Minimum interval between notifications (default `3s`)               |
| `--stall-after <dur>` | Nag once after this long without progress                           |
| `--no-color`          | Disable colored output                                              |

Durations accept `120s`, `10m`, `2m 14s`, or bare milliseconds.

## Notifications

Delivery is a fan-out across every selected sink; one failing sink never blocks
the others, and no delivery failure ever aborts a watch.

- **macOS native (default):** a bundled Swift helper (icon + click-to-focus),
  falling back to `terminal-notifier`, then `osascript`. Degrades silently to a
  no-op off macOS. Build the helper from `helper/macos` and point
  `NAGGER_MACOS_HELPER` at it for the richest experience.
- **Terminal:** an always-on, timestamped event log plus a final summary table.
- **Remote (opt-in):** `ntfy.sh` topic (`NAGGER_NTFY_TOPIC`), a generic webhook
  (`NAGGER_WEBHOOK_URL`, POSTs JSON), and Slack incoming webhooks
  (`NAGGER_SLACK_WEBHOOK_URL`).

Distinct sounds for milestone / success / failure; `--silent` mutes them.

## Config & daemon mode

Run a config-defined set of watchers as a daemon and query them live:

```ts
// nagger.config.ts
import { defineConfig } from "nagger";

export default defineConfig({
  defaults: { step: 10, stallAfter: "120s" },
  notify: {
    macos: { sound: { milestone: "Tink", success: "Glass", failure: "Basso" } },
    ntfy: { topic: process.env.NAGGER_NTFY_TOPIC },
  },
  watches: [
    { name: "api-health", type: "http", url: "https://api.example.com/health", expect: 200 },
    {
      name: "nightly-etl",
      type: "log",
      path: "/var/log/etl.log",
      pattern: /(?<current>\d+)\/(?<total>\d+) rows/,
    },
  ],
});
```

```bash
nag serve --config nagger.config.ts   # starts the daemon + JSON-RPC socket
nag status                            # ▲ api-health   40% · ETA 1m 12s
```

The daemon exposes a newline-delimited JSON-RPC unix socket — the seam a Phase 2
macOS menu bar client attaches to without any changes to core.

## Architecture

Event-driven core with three layers, mock-first adapters throughout (toggle via
`NAGGER_MOCK=1`):

```
Watchers (sources) → Milestone Engine (state) → Notifiers (sinks)
```

pnpm + Turborepo monorepo:

| Package                             | Responsibility                                         |
| ----------------------------------- | ------------------------------------------------------ |
| [`@nagger/core`](packages/core)     | Watchers, milestone engine, runner, schema, config     |
| [`@nagger/notify`](packages/notify) | Notification sinks + fan-out + factory                 |
| [`@nagger/daemon`](packages/daemon) | JSON-RPC socket, composite watches, state file         |
| [`nagger`](packages/nagger)         | The CLI (`nagger` / `nag`) + public `defineConfig` API |

### Watchers

| Watcher   | Trigger                          | Progress source                                  |
| --------- | -------------------------------- | ------------------------------------------------ |
| `script`  | wraps a command via `nag run --` | stdout/stderr regex (`pct` or `current`/`total`) |
| `http`    | polls a URL                      | binary down/up + expected status/body            |
| `port`    | TCP connect attempts             | binary closed/open                               |
| `log`     | tails a file                     | regex with `pct` or `current`/`total`            |
| `pid`     | watches a PID or name            | lifecycle (running/exited)                       |
| `compose` | aggregates children              | weighted average + all-of/any-of                 |

## Development

```bash
pnpm install
pnpm build        # tsc project references across all packages (via Turborepo)
pnpm test         # Vitest
pnpm lint         # ESLint
pnpm audit        # zero high/critical required
pnpm build:binary # single-file binary via `bun build --compile`
```

Requires Node 22+, pnpm 10+. The single-file binary build requires
[Bun](https://bun.sh).

## Non-goals (v1)

No web dashboard, accounts, telemetry, or persistent history DB. No Windows
support; Linux is best-effort (remote notifiers). The macOS menu bar app is
Phase 2 — the daemon's JSON-RPC socket is already in place for it.

## License

[MIT](LICENSE) © Kevin Segal
