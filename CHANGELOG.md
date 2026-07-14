# @absolutejs/metrics changelog

## 0.2.6 — 2026-07-14

- Adds `@absolutejs/metrics/router`, translating route and acquire counters,
  last-route latency, rejections by the router's closed decision vocabulary,
  and load distribution by operator-configured shard. Tenant ids are never
  emitted as labels.

## 0.2.5 — 2026-07-14

- Runtime collection now consumes the current `running`, `backoff`, and
  `lastSpawnMs` fields while retaining compatibility with the legacy `active`
  field.

## 0.2.4 — 2026-07-14

- Adds `wakeSchedulerCollector` on the existing `/queue` subpath for
  `@absolutejs/queue`'s control-plane scheduler metrics: schedules, enabled and
  draining state, firings, errors, catch-up misses, overlap skips, and tick
  latency. Static labels distinguish multiple schedulers without coupling the
  metrics package to queue as a runtime dependency.

## 0.2.3 — 2026-07-14

- Add `@absolutejs/metrics/egress`: a bounded-cardinality collector for
  `@absolutejs/runtime`'s egress guard metrics. It emits tracked tenants,
  admitted requests, observed response bytes, and denials labeled only by the
  guard's closed reason vocabulary; tenant IDs never become Prometheus labels.

## 0.2.2 — 2026-07-14

- The secrets collector now consumes current `@absolutejs/secrets` metrics:
  `redactionsApplied` and `redactionsBase64`. It retains the legacy
  `redactsApplied` alias for older brokers and emits the new
  `abs_secrets_redactions_base64_total` counter.

## 0.2.1 — 2026-07-14

- `metricsPlugin()` now accepts an async `authorize(request)` callback so a
  service can protect operational counters without replacing the official
  Elysia exposure path. Rejected requests return `401` with a Bearer challenge
  by default; `onUnauthorized(request)` can supply a different response.
- Authorization runs before collectors, so an unauthenticated request cannot
  trigger or infer collector behavior.

## 0.2.0 — 2026-07-13

Completes the observability triad's exposure path: the errors and
logs packages now have collector subpaths like the rest of the
substrate.

### Added — collectors

| Subpath   | Translates                                                                           |
| --------- | ------------------------------------------------------------------------------------ |
| `/errors` | `@absolutejs/errors` tracker — captured, capture errors, distinct fingerprints       |
| `/logs`   | `@absolutejs/logs` logger — emitted per level, writes, write errors, per-sink errors |

- **`errorsCollector`** (`@absolutejs/metrics/errors`) — translates
  `tracker.metrics()` (`ErrorTrackerMetrics`) into
  `abs_errors_captured_total`, `abs_errors_capture_errors_total`, and
  the `abs_errors_fingerprints` gauge. `byFingerprint` is emitted as
  the **distinct count only** — fingerprints are content-derived and
  effectively unbounded, so per-fingerprint labels would be a
  Prometheus cardinality anti-pattern (unlike the bounded,
  operator-defined key sets other collectors label on).
- **`logsCollector`** (`@absolutejs/metrics/logs`) — translates
  `logger.metrics()` (`LoggerMetrics`) into
  `abs_logs_emitted_total{level=…}` (bounded six-level set),
  `abs_logs_writes_total`, `abs_logs_write_errors_total`, and
  `abs_logs_sink_errors_total{sink=…}`.

Both follow the established collector contract: a
`() => instance.metrics()` thunk with a structurally-typed shape — no
hard dep on the source package; absent fields are skipped.

### Repo

- Added the family-standard `.prettierrc` (tabs, single quotes, no
  trailing comma) that sibling repos already carry; `bun run format`
  previously fell back to Prettier defaults.

## 0.1.0 — 2026-05-31

Initial release. Closes the first part of G9 (observability triad) —
the substrate now has Prometheus / OpenMetrics exposure.

### Added — core library

- **`MetricSample`** intermediate format. `{ name, value, type, help?,
labels? }`. The minimum shape every Prometheus emission needs.
- **`MetricCollector`** — function returning samples. Sync or async.
- **`createMetricsRegistry()`** — composes collectors under
  source names; `register` / `unregister` / `collect` / `render` /
  `sources`. Re-registering replaces.
- **`renderPrometheus(samples)`** — text-format renderer per
  Prometheus / OpenMetrics conventions. Groups same-name samples
  under one `# HELP` + `# TYPE` block, emits `+Inf` / `-Inf` / `NaN`
  correctly, escapes label values (`\\`, `\"`, `\n`), validates
  metric + label names.
- **`metricsPlugin({ registry, path? })`** — Elysia plugin (optional
  peer dep) exposing `GET /metrics` (default path) with the right
  Prometheus content-type. `makeElysia` factory for testing.
- **`counter()` / `gauge()`** — sample factories for collector
  authors.
- **`PROMETHEUS_CONTENT_TYPE`** — the canonical scraper content type
  (`'text/plain; version=0.0.4; charset=utf-8'`).

### Added — per-source collectors (subpath imports)

Each collector takes a `() => <metrics shape>` function so the
substrate packages aren't hard deps. Pass `() => instance.metrics()`;
TypeScript's structural typing handles the rest.

| Subpath       | Translates                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/runtime`    | `@absolutejs/runtime` — active, spawns, exits-by-reason, backoff, uptime                                          |
| `/queue`      | `@absolutejs/queue` — runs/completed/failed/retried/dead-lettered, polls, reaped, last-tick                       |
| `/sync`       | `@absolutejs/sync` engine — version, changelog, subscriptions (incl. per-collection), mutations, schedules, cache |
| `/secrets`    | `@absolutejs/secrets` broker — resolves/hits/misses/errors, rotates, redacts, cache entries                       |
| `/rate-limit` | `@absolutejs/rate-limit` — allow/block decisions with labels, drift, store size                                   |
| `/audit`      | `@absolutejs/audit` — appended, append errors, per-sink errors with labels                                        |
| `/dispatch`   | `@absolutejs/dispatch` — sent/failed totals plus per-channel breakdown                                            |

### Conventions

- Metric names: `abs_<source>_<metric>` (snake_case). Counters end in
  `_total`; gauges don't (per Prometheus naming convention).
- All counters emit as `counter` type. Gauges as `gauge`. Histograms
  are documented but not yet emitted by any substrate package.
- Labels: collectors stamp source-specific dimensions (e.g.
  `reason` on runtime exits, `channel` on dispatch, `decision` on
  rate-limit). Per-source `labels?: Record<string, string>` option
  on queue + rate-limit collectors adds static dimensions for
  multi-instance use.

### Tests

28 tests covering: text-format correctness (HELP/TYPE grouping,
label escaping, Inf/NaN, invalid-name rejection); registry compose/
replace/unregister/async; every per-source collector with full +
partial shapes; Elysia plugin via injected fake (default path,
custom path, 500-on-collector-error); end-to-end three-source
composition.

### Build

Eight bundle entries (`index` + seven collectors). Elysia marked
external so collector bundles stay ~5–7KB.

### License

BSL-1.1 with named carveout against hosted observability platforms
(Datadog, Grafana Cloud, New Relic, etc.). Change date: 2030-05-31
(Apache 2.0).
