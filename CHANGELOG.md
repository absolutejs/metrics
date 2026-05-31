# @absolutejs/metrics changelog

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

| Subpath | Translates |
| --- | --- |
| `/runtime` | `@absolutejs/runtime` — active, spawns, exits-by-reason, backoff, uptime |
| `/queue` | `@absolutejs/queue` — runs/completed/failed/retried/dead-lettered, polls, reaped, last-tick |
| `/sync` | `@absolutejs/sync` engine — version, changelog, subscriptions (incl. per-collection), mutations, schedules, cache |
| `/secrets` | `@absolutejs/secrets` broker — resolves/hits/misses/errors, rotates, redacts, cache entries |
| `/rate-limit` | `@absolutejs/rate-limit` — allow/block decisions with labels, drift, store size |
| `/audit` | `@absolutejs/audit` — appended, append errors, per-sink errors with labels |
| `/dispatch` | `@absolutejs/dispatch` — sent/failed totals plus per-channel breakdown |

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
