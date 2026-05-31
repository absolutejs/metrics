/**
 * Collector for `@absolutejs/sync`'s `engine.metrics()` shape.
 *
 * Usage:
 *
 *   import { syncCollector } from '@absolutejs/metrics/sync';
 *   registry.register('sync', syncCollector(() => engine.metrics()));
 */

import { counter, gauge, type MetricCollector, type MetricSample } from '../index';

export type SyncMetricsShape = {
	at?: number;
	uptimeMs?: number;
	version?: number;
	changeLog?: {
		entries?: number;
		capacity?: number;
		oldestAgeMs?: number | null;
	};
	subscriptions?: {
		total?: number;
		byCollection?: Record<string, number>;
		byTenant?: Record<string, number>;
	};
	mutations?: {
		completed?: number;
		failed?: number;
		retried?: number;
		inFlight?: number;
		queued?: number;
	};
	schedules?: { registered?: number };
	reactiveCache?: { entries?: number; capacity?: number };
};

export const syncCollector = (
	source: () => SyncMetricsShape | Promise<SyncMetricsShape>
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];

	if (m.uptimeMs !== undefined) {
		samples.push(gauge('abs_sync_uptime_ms', m.uptimeMs, { help: 'Sync engine uptime in milliseconds' }));
	}
	if (m.version !== undefined) {
		samples.push(gauge('abs_sync_version', m.version, { help: 'Monotonic change-feed version' }));
	}
	if (m.changeLog?.entries !== undefined) {
		samples.push(gauge('abs_sync_changelog_entries', m.changeLog.entries, { help: 'Retained change-log entries' }));
	}
	if (m.changeLog?.capacity !== undefined) {
		samples.push(gauge('abs_sync_changelog_capacity', m.changeLog.capacity, { help: 'Configured change-log capacity' }));
	}
	if (m.changeLog?.oldestAgeMs !== undefined && m.changeLog.oldestAgeMs !== null) {
		samples.push(gauge('abs_sync_changelog_oldest_age_ms', m.changeLog.oldestAgeMs, { help: 'Age of the oldest retained log entry' }));
	}
	if (m.subscriptions?.total !== undefined) {
		samples.push(gauge('abs_sync_subscriptions', m.subscriptions.total, { help: 'Active subscriptions across collections' }));
	}
	if (m.subscriptions?.byCollection !== undefined) {
		for (const [collection, count] of Object.entries(m.subscriptions.byCollection)) {
			samples.push(gauge('abs_sync_subscriptions_per_collection', count, {
				help: 'Active subscriptions per collection',
				labels: { collection }
			}));
		}
	}
	if (m.mutations !== undefined) {
		if (m.mutations.completed !== undefined) {
			samples.push(counter('abs_sync_mutations_completed_total', m.mutations.completed, { help: 'Successful mutation invocations' }));
		}
		if (m.mutations.failed !== undefined) {
			samples.push(counter('abs_sync_mutations_failed_total', m.mutations.failed, { help: 'Failed mutation invocations' }));
		}
		if (m.mutations.retried !== undefined) {
			samples.push(counter('abs_sync_mutations_retried_total', m.mutations.retried, { help: 'Retried mutation invocations' }));
		}
		if (m.mutations.inFlight !== undefined) {
			samples.push(gauge('abs_sync_mutations_in_flight', m.mutations.inFlight, { help: 'Mutations currently executing' }));
		}
		if (m.mutations.queued !== undefined) {
			samples.push(gauge('abs_sync_mutations_queued', m.mutations.queued, { help: 'Mutations waiting on the concurrency semaphore' }));
		}
	}
	if (m.schedules?.registered !== undefined) {
		samples.push(gauge('abs_sync_schedules', m.schedules.registered, { help: 'Registered schedule count' }));
	}
	if (m.reactiveCache?.entries !== undefined) {
		samples.push(gauge('abs_sync_reactive_cache_entries', m.reactiveCache.entries, { help: 'Entries in the reactive-query cache' }));
	}
	return samples;
};
