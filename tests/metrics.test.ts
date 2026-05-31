/**
 * Tests for @absolutejs/metrics — registry, renderer, per-source
 * collectors, Elysia plugin via a fake makeElysia.
 */
import { describe, expect, test } from 'bun:test';
import {
	counter,
	createMetricsRegistry,
	gauge,
	metricsPlugin,
	PROMETHEUS_CONTENT_TYPE,
	renderPrometheus,
	type MetricSample
} from '../src/index';
import { runtimeCollector } from '../src/collectors/runtime';
import { queueCollector } from '../src/collectors/queue';
import { syncCollector } from '../src/collectors/sync';
import { secretsCollector } from '../src/collectors/secrets';
import { auditCollector } from '../src/collectors/audit';
import { dispatchCollector } from '../src/collectors/dispatch';
import { rateLimitCollector } from '../src/collectors/rateLimit';

// =============================================================================
// renderPrometheus — text-format correctness
// =============================================================================

describe('renderPrometheus', () => {
	test('emits HELP + TYPE once per metric, then rows', () => {
		const text = renderPrometheus([
			gauge('abs_test_count', 5, { help: 'A test count' }),
			counter('abs_test_total', 100, { help: 'A test total' })
		]);
		expect(text).toContain('# HELP abs_test_count A test count');
		expect(text).toContain('# TYPE abs_test_count gauge');
		expect(text).toContain('abs_test_count 5');
		expect(text).toContain('# HELP abs_test_total A test total');
		expect(text).toContain('# TYPE abs_test_total counter');
		expect(text).toContain('abs_test_total 100');
	});

	test('groups same-named samples under one HELP/TYPE block', () => {
		const text = renderPrometheus([
			counter('abs_runtime_exits_total', 3, {
				help: 'Exits',
				labels: { reason: 'crashed' }
			}),
			counter('abs_runtime_exits_total', 7, {
				help: 'Exits',
				labels: { reason: 'idle' }
			})
		]);
		expect((text.match(/# HELP abs_runtime_exits_total/g) ?? [])).toHaveLength(1);
		expect((text.match(/# TYPE abs_runtime_exits_total/g) ?? [])).toHaveLength(1);
		expect(text).toContain('abs_runtime_exits_total{reason="crashed"} 3');
		expect(text).toContain('abs_runtime_exits_total{reason="idle"} 7');
	});

	test('escapes label values with backslash + quote + newline', () => {
		const text = renderPrometheus([
			counter('abs_test', 1, {
				labels: { msg: 'a"b\\c\nd' }
			})
		]);
		expect(text).toContain('msg="a\\"b\\\\c\\nd"');
	});

	test('renders +Inf / -Inf / NaN per Prometheus spec', () => {
		const text = renderPrometheus([
			gauge('abs_test', Infinity),
			gauge('abs_test_neg', -Infinity),
			gauge('abs_test_nan', NaN)
		]);
		expect(text).toContain('abs_test +Inf');
		expect(text).toContain('abs_test_neg -Inf');
		expect(text).toContain('abs_test_nan NaN');
	});

	test('rejects invalid metric names', () => {
		expect(() => renderPrometheus([counter('123-bad-name', 1)])).toThrow(
			'invalid metric name'
		);
	});

	test('rejects invalid label names', () => {
		expect(() =>
			renderPrometheus([
				counter('abs_test', 1, { labels: { '123': 'value' } })
			])
		).toThrow('invalid label name');
	});

	test('empty input → empty string', () => {
		expect(renderPrometheus([])).toBe('');
	});
});

// =============================================================================
// Registry
// =============================================================================

describe('createMetricsRegistry', () => {
	test('register + render aggregates samples from every collector', async () => {
		const registry = createMetricsRegistry();
		registry.register('a', () => [counter('a_total', 1, { help: 'a' })]);
		registry.register('b', () => [gauge('b_value', 2, { help: 'b' })]);
		const text = await registry.render();
		expect(text).toContain('a_total 1');
		expect(text).toContain('b_value 2');
	});

	test('sources() returns registered source names', () => {
		const registry = createMetricsRegistry();
		registry.register('runtime', () => []);
		registry.register('queue', () => []);
		expect(registry.sources().sort()).toEqual(['queue', 'runtime']);
	});

	test('re-registering replaces previous collector', async () => {
		const registry = createMetricsRegistry();
		registry.register('x', () => [counter('first_total', 1)]);
		registry.register('x', () => [counter('second_total', 1)]);
		const samples = await registry.collect();
		expect(samples.map((s) => s.name)).toEqual(['second_total']);
	});

	test('unregister removes a collector', async () => {
		const registry = createMetricsRegistry();
		registry.register('x', () => [counter('keep_total', 1)]);
		registry.register('y', () => [counter('drop_total', 1)]);
		registry.unregister('y');
		const samples = await registry.collect();
		expect(samples.map((s) => s.name).sort()).toEqual(['keep_total']);
	});

	test('async collectors are awaited', async () => {
		const registry = createMetricsRegistry();
		registry.register('async', async () => {
			await new Promise((r) => setTimeout(r, 5));
			return [counter('async_total', 42)];
		});
		const samples = await registry.collect();
		expect(samples[0]?.value).toBe(42);
	});
});

// =============================================================================
// runtimeCollector
// =============================================================================

describe('runtimeCollector', () => {
	test('emits active + spawns + exits + backoff + uptime', async () => {
		const collector = runtimeCollector(() => ({
			active: 3,
			lastSpawnMs: 12,
			startedAt: 1000,
			totalBackoffEntries: 2,
			totalExits: { crashed: 1, idle: 4 },
			totalSpawns: 5,
			uptimeMs: 60_000
		}));
		const samples = await collector();
		const names = samples.map((s) => s.name).sort();
		expect(names).toContain('abs_runtime_active');
		expect(names).toContain('abs_runtime_uptime_ms');
		expect(names).toContain('abs_runtime_spawns_total');
		expect(names).toContain('abs_runtime_backoff_total');
		// Two exit-reason permutations under one name.
		expect(samples.filter((s) => s.name === 'abs_runtime_exits_total')).toHaveLength(2);
		expect(samples.find((s) => s.labels?.reason === 'crashed')?.value).toBe(1);
	});

	test('skips fields that aren\'t reported', async () => {
		const collector = runtimeCollector(() => ({ active: 1 }));
		const samples = await collector();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.name).toBe('abs_runtime_active');
	});
});

// =============================================================================
// queueCollector
// =============================================================================

describe('queueCollector', () => {
	test('emits the worker metrics shape as counters + gauges', async () => {
		const collector = queueCollector(() => ({
			active: 2,
			capacity: 8,
			completed: 95,
			deadLettered: 1,
			draining: false,
			failed: 5,
			lastTickMs: 12,
			polls: 200,
			reaped: 0,
			retried: 3,
			runs: 100
		}));
		const samples = await collector();
		const byName: Record<string, number> = {};
		for (const s of samples) byName[s.name] = s.value;
		expect(byName.abs_queue_active).toBe(2);
		expect(byName.abs_queue_capacity).toBe(8);
		expect(byName.abs_queue_draining).toBe(0);
		expect(byName.abs_queue_completed_total).toBe(95);
		expect(byName.abs_queue_failed_total).toBe(5);
		expect(byName.abs_queue_last_tick_ms).toBe(12);
	});

	test('draining=true → gauge value 1', async () => {
		const samples = await queueCollector(() => ({ draining: true }))();
		expect(samples.find((s) => s.name === 'abs_queue_draining')?.value).toBe(1);
	});

	test('static labels applied to every sample', async () => {
		const samples = await queueCollector(
			() => ({ runs: 10 }),
			{ labels: { worker: 'email' } }
		)();
		expect(samples[0]?.labels?.worker).toBe('email');
	});
});

// =============================================================================
// syncCollector
// =============================================================================

describe('syncCollector', () => {
	test('emits version, changelog, subscriptions, mutations, schedules, cache', async () => {
		const collector = syncCollector(() => ({
			at: 1000,
			changeLog: { capacity: 1024, entries: 100, oldestAgeMs: 60_000 },
			mutations: {
				completed: 500,
				failed: 5,
				inFlight: 1,
				queued: 0,
				retried: 10
			},
			reactiveCache: { capacity: 256, entries: 32 },
			schedules: { registered: 4 },
			subscriptions: {
				byCollection: { posts: 20, users: 30 },
				byTenant: {},
				total: 50
			},
			uptimeMs: 5_000,
			version: 1234
		}));
		const samples = await collector();
		const byName: Record<string, MetricSample[]> = {};
		for (const s of samples) (byName[s.name] ??= []).push(s);
		expect(byName.abs_sync_version?.[0]?.value).toBe(1234);
		expect(byName.abs_sync_changelog_entries?.[0]?.value).toBe(100);
		expect(byName.abs_sync_subscriptions?.[0]?.value).toBe(50);
		expect(byName.abs_sync_subscriptions_per_collection).toHaveLength(2);
		expect(byName.abs_sync_mutations_completed_total?.[0]?.value).toBe(500);
		expect(byName.abs_sync_schedules?.[0]?.value).toBe(4);
		expect(byName.abs_sync_reactive_cache_entries?.[0]?.value).toBe(32);
	});

	test('partial shapes — only present fields emit', async () => {
		const samples = await syncCollector(() => ({ version: 7 }))();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.name).toBe('abs_sync_version');
	});
});

// =============================================================================
// secretsCollector / auditCollector / dispatchCollector / rateLimitCollector
// =============================================================================

describe('secretsCollector', () => {
	test('emits resolve/rotate/redact counters + cache gauge', async () => {
		const samples = await secretsCollector(() => ({
			cacheEntries: 5,
			invalidations: 3,
			redactCalls: 10,
			redactsApplied: 7,
			resolveErrors: 1,
			resolveHits: 80,
			resolveMisses: 20,
			resolves: 100,
			rotateErrors: 0,
			rotates: 4
		}))();
		const names = samples.map((s) => s.name);
		expect(names).toContain('abs_secrets_resolves_total');
		expect(names).toContain('abs_secrets_resolve_hits_total');
		expect(names).toContain('abs_secrets_rotates_total');
		expect(names).toContain('abs_secrets_redact_calls_total');
		expect(names).toContain('abs_secrets_cache_entries');
	});
});

describe('auditCollector', () => {
	test('emits appended + per-sink errors', async () => {
		const samples = await auditCollector(() => ({
			appendErrors: 1,
			appended: 500,
			sinkErrors: { console: 0, postgres: 1 }
		}))();
		const sinkErrors = samples.filter(
			(s) => s.name === 'abs_audit_sink_errors_total'
		);
		expect(sinkErrors).toHaveLength(2);
		expect(sinkErrors.find((s) => s.labels?.sink === 'postgres')?.value).toBe(1);
	});
});

describe('dispatchCollector', () => {
	test('emits totals + per-channel breakdown', async () => {
		const samples = await dispatchCollector(() => ({
			byChannel: {
				email: { failed: 1, sent: 99 },
				push: { failed: 0, sent: 0 },
				sms: { failed: 0, sent: 50 }
			},
			failed: 1,
			sent: 149
		}))();
		const totals = samples.filter((s) => s.name === 'abs_dispatch_sent_total');
		expect(totals[0]?.value).toBe(149);
		const channelSends = samples.filter(
			(s) => s.name === 'abs_dispatch_channel_sent_total'
		);
		expect(channelSends).toHaveLength(3);
		expect(channelSends.find((s) => s.labels?.channel === 'email')?.value).toBe(99);
	});
});

describe('rateLimitCollector', () => {
	test('emits decision counters with allow/block labels', async () => {
		const samples = await rateLimitCollector(() => ({
			allow: 100,
			block: 5,
			store: { capacity: 1024, entries: 12 }
		}))();
		const decisions = samples.filter(
			(s) => s.name === 'abs_rate_limit_decisions_total'
		);
		expect(decisions).toHaveLength(2);
		expect(decisions.find((s) => s.labels?.decision === 'allow')?.value).toBe(100);
		expect(decisions.find((s) => s.labels?.decision === 'block')?.value).toBe(5);
		expect(samples.find((s) => s.name === 'abs_rate_limit_store_entries')?.value).toBe(12);
	});

	test('static labels merged with allow/block labels', async () => {
		const samples = await rateLimitCollector(
			() => ({ allow: 1, block: 0 }),
			{ labels: { limiter: 'api' } }
		)();
		const allow = samples.find((s) => s.labels?.decision === 'allow');
		expect(allow?.labels?.limiter).toBe('api');
		expect(allow?.labels?.decision).toBe('allow');
	});
});

// =============================================================================
// metricsPlugin — Elysia plugin via injected fake
// =============================================================================

describe('metricsPlugin', () => {
	test('registers GET path; handler renders Prometheus text', async () => {
		const registry = createMetricsRegistry();
		registry.register('runtime', () => [
			gauge('abs_runtime_active', 3, { help: 'Active tenants' })
		]);

		let registeredPath: string | undefined;
		let handler: (() => Promise<Response> | Response) | undefined;
		const fakeApp = {
			get: (path: string, fn: () => Promise<Response> | Response) => {
				registeredPath = path;
				handler = fn;
				return fakeApp;
			}
		};
		await metricsPlugin({
			makeElysia: () => fakeApp,
			path: '/observe',
			registry
		});

		expect(registeredPath).toBe('/observe');
		expect(handler).toBeDefined();
		const response = await handler!();
		expect(response.headers.get('content-type')).toBe(PROMETHEUS_CONTENT_TYPE);
		const text = await response.text();
		expect(text).toContain('abs_runtime_active 3');
		expect(text).toContain('# HELP abs_runtime_active');
	});

	test('default path is /metrics', async () => {
		const registry = createMetricsRegistry();
		let registeredPath: string | undefined;
		const fakeApp = {
			get: (path: string, _fn: () => Promise<Response> | Response) => {
				registeredPath = path;
				return fakeApp;
			}
		};
		await metricsPlugin({
			makeElysia: () => fakeApp,
			registry
		});
		expect(registeredPath).toBe('/metrics');
	});

	test('returns 500 (with prometheus content-type) when a collector throws', async () => {
		const registry = createMetricsRegistry();
		registry.register('broken', () => {
			throw new Error('collector blew up');
		});
		let handler: (() => Promise<Response> | Response) | undefined;
		const fakeApp = {
			get: (_path: string, fn: () => Promise<Response> | Response) => {
				handler = fn;
				return fakeApp;
			}
		};
		await metricsPlugin({
			makeElysia: () => fakeApp,
			registry
		});
		const response = await handler!();
		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe(PROMETHEUS_CONTENT_TYPE);
		expect(await response.text()).toContain('collector blew up');
	});
});

// =============================================================================
// End-to-end: substrate-shape → registry → Prometheus text
// =============================================================================

describe('end-to-end', () => {
	test('wiring runtime + queue + sync via registry produces composed output', async () => {
		const registry = createMetricsRegistry();
		registry.register('runtime', runtimeCollector(() => ({
			active: 2,
			totalSpawns: 10
		})));
		registry.register('queue', queueCollector(() => ({
			active: 1,
			completed: 50,
			failed: 0
		})));
		registry.register('sync', syncCollector(() => ({
			subscriptions: { total: 5 },
			version: 42
		})));
		const text = await registry.render();
		expect(text).toContain('abs_runtime_active 2');
		expect(text).toContain('abs_runtime_spawns_total 10');
		expect(text).toContain('abs_queue_active 1');
		expect(text).toContain('abs_queue_completed_total 50');
		expect(text).toContain('abs_sync_version 42');
		expect(text).toContain('abs_sync_subscriptions 5');
	});
});
