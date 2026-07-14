/**
 * Collector for `@absolutejs/runtime`'s `metrics()` shape.
 *
 * Usage:
 *
 *   import { runtimeCollector } from '@absolutejs/metrics/runtime';
 *   registry.register('runtime', runtimeCollector(() => runtime.metrics()));
 */

import {
	counter,
	gauge,
	type MetricCollector,
	type MetricSample
} from '../index';

/** Narrow subset of `runtime.metrics()` we read. */
export type RuntimeMetricsShape = {
	startedAt?: number;
	uptimeMs?: number;
	/** Current @absolutejs/runtime field. */
	running?: number;
	/** Legacy field retained for older runtime implementations. */
	active?: number;
	backoff?: number;
	totalSpawns?: number;
	totalExits?: Record<string, number>;
	totalBackoffEntries?: number;
	lastSpawnMs?: number;
};

const HELP_ACTIVE = 'Tenants currently active in the runtime';
const HELP_SPAWNS = 'Total tenant spawns since runtime start';
const HELP_EXITS = 'Total tenant exits by reason';
const HELP_BACKOFF = 'Total backoff-window entries since runtime start';
const HELP_BACKOFF_CURRENT = 'Tenant keys currently in runtime backoff';
const HELP_LAST_SPAWN =
	'Duration of the most recent tenant spawn in milliseconds';
const HELP_UPTIME = 'Runtime uptime in milliseconds';

export const runtimeCollector =
	(
		source: () => RuntimeMetricsShape | Promise<RuntimeMetricsShape>
	): MetricCollector =>
	async () => {
		const m = await source();
		const samples: MetricSample[] = [];
		const active = m.running ?? m.active;
		if (active !== undefined) {
			samples.push(
				gauge('abs_runtime_active', active, { help: HELP_ACTIVE })
			);
		}
		if (m.backoff !== undefined) {
			samples.push(
				gauge('abs_runtime_backoff_current', m.backoff, {
					help: HELP_BACKOFF_CURRENT
				})
			);
		}
		if (m.lastSpawnMs !== undefined) {
			samples.push(
				gauge('abs_runtime_last_spawn_ms', m.lastSpawnMs, {
					help: HELP_LAST_SPAWN
				})
			);
		}
		if (m.uptimeMs !== undefined) {
			samples.push(
				gauge('abs_runtime_uptime_ms', m.uptimeMs, {
					help: HELP_UPTIME
				})
			);
		}
		if (m.totalSpawns !== undefined) {
			samples.push(
				counter('abs_runtime_spawns_total', m.totalSpawns, {
					help: HELP_SPAWNS
				})
			);
		}
		if (m.totalBackoffEntries !== undefined) {
			samples.push(
				counter('abs_runtime_backoff_total', m.totalBackoffEntries, {
					help: HELP_BACKOFF
				})
			);
		}
		if (m.totalExits !== undefined) {
			for (const [reason, value] of Object.entries(m.totalExits)) {
				samples.push(
					counter('abs_runtime_exits_total', value, {
						help: HELP_EXITS,
						labels: { reason }
					})
				);
			}
		}
		return samples;
	};
