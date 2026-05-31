# @absolutejs/metrics

Prometheus / OpenMetrics exposure for the AbsoluteJS substrate. Every
substrate package already exposes a typed `metrics()` snapshot — this
package converts those snapshots into the scrape format Prometheus,
VictoriaMetrics, Grafana Agent, OTLP collectors, etc. all understand.

## Why

The substrate ships instrumentation but no exposure path. Operators
wire one `metricsPlugin()` and every `metrics()` shape across the
substrate becomes a scrape target — no hand-rolled `/metrics` per
service.

## Install

```bash
bun add @absolutejs/metrics
```

`elysia` is an optional peer dep (only needed for `metricsPlugin`).

## Usage

```ts
import { Elysia } from 'elysia';
import { createMetricsRegistry, metricsPlugin } from '@absolutejs/metrics';
import { runtimeCollector } from '@absolutejs/metrics/runtime';
import { queueCollector } from '@absolutejs/metrics/queue';
import { syncCollector } from '@absolutejs/metrics/sync';
import { secretsCollector } from '@absolutejs/metrics/secrets';
import { auditCollector } from '@absolutejs/metrics/audit';
import { dispatchCollector } from '@absolutejs/metrics/dispatch';

const registry = createMetricsRegistry();
registry.register('runtime', runtimeCollector(() => runtime.metrics()));
registry.register('queue', queueCollector(() => worker.metrics()));
registry.register('sync', syncCollector(() => engine.metrics()));
registry.register('secrets', secretsCollector(() => broker.metrics()));
registry.register('audit', auditCollector(() => audit.metrics()));
registry.register('dispatch', dispatchCollector(() => dispatcher.metrics()));

const app = new Elysia().use(await metricsPlugin({ registry }));
//        GET /metrics → Prometheus text
```

Output looks like:

```text
# HELP abs_runtime_active Tenants currently active in the runtime
# TYPE abs_runtime_active gauge
abs_runtime_active 3
# HELP abs_queue_completed_total Successful job completions
# TYPE abs_queue_completed_total counter
abs_queue_completed_total 1057
# HELP abs_sync_subscriptions Active subscriptions across collections
# TYPE abs_sync_subscriptions gauge
abs_sync_subscriptions 142
…
```

## Collectors

Each substrate package gets its own subpath import:

| Subpath | Source |
| --- | --- |
| `@absolutejs/metrics/runtime` | `@absolutejs/runtime` |
| `@absolutejs/metrics/queue` | `@absolutejs/queue` |
| `@absolutejs/metrics/sync` | `@absolutejs/sync` engine |
| `@absolutejs/metrics/secrets` | `@absolutejs/secrets` broker |
| `@absolutejs/metrics/rate-limit` | `@absolutejs/rate-limit` |
| `@absolutejs/metrics/audit` | `@absolutejs/audit` |
| `@absolutejs/metrics/dispatch` | `@absolutejs/dispatch` |

The substrate packages aren't hard deps. Each collector takes a
`() => <metrics shape>` function — pass `() => instance.metrics()`
and TypeScript's structural typing handles the rest.

## Custom metrics

```ts
import { counter, gauge } from '@absolutejs/metrics';

registry.register('app', () => [
  counter('myapp_requests_total', requestCount, {
    help: 'Total HTTP requests',
    labels: { route: '/api/users' }
  }),
  gauge('myapp_workers', activeWorkers, {
    help: 'Currently running workers'
  })
]);
```

## Naming

Convention: `abs_<source>_<metric>` for substrate metrics
(`abs_runtime_active`, `abs_queue_completed_total`). Your app's
metrics should use `<app>_<metric>` so they don't collide.

Counters end in `_total`. Gauges don't. (Per Prometheus naming
conventions.)

## License

BSL-1.1 with named carveout against hosted observability platforms
(Datadog, Grafana Cloud, New Relic, etc.). Change date: 2030-05-31
(Apache 2.0).
