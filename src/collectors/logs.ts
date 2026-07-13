/**
 * Collector for `@absolutejs/logs`' `logger.metrics()` shape
 * (`LoggerMetrics`).
 *
 * Usage:
 *
 *   import { logsCollector } from '@absolutejs/metrics/logs';
 *   registry.register('logs', logsCollector(() => logger.metrics()));
 */

import { counter, type MetricCollector, type MetricSample } from '../index';

/** Narrow subset of `logger.metrics()` we read. */
export type LogsMetricsShape = {
	/** Events that passed the level filter, keyed by level (bounded set). */
	logged?: Record<string, number>;
	writes?: number;
	writeErrors?: number;
	/** Per-sink error counts, keyed by sink name (bounded set). */
	sinkErrors?: Record<string, number>;
};

export const logsCollector =
	(
		source: () => LogsMetricsShape | Promise<LogsMetricsShape>
	): MetricCollector =>
	async () => {
		const m = await source();
		const samples: MetricSample[] = [];

		if (m.logged !== undefined) {
			for (const [level, count] of Object.entries(m.logged)) {
				samples.push(
					counter('abs_logs_emitted_total', count, {
						help: 'Log events emitted per level (post level-filter)',
						labels: { level }
					})
				);
			}
		}
		if (m.writes !== undefined) {
			samples.push(
				counter('abs_logs_writes_total', m.writes, {
					help: 'Successful sink writes (one per sink per event)'
				})
			);
		}
		if (m.writeErrors !== undefined) {
			samples.push(
				counter('abs_logs_write_errors_total', m.writeErrors, {
					help: 'Sink write errors across all sinks'
				})
			);
		}
		if (m.sinkErrors !== undefined) {
			for (const [sink, count] of Object.entries(m.sinkErrors)) {
				samples.push(
					counter('abs_logs_sink_errors_total', count, {
						help: 'Per-sink error count',
						labels: { sink }
					})
				);
			}
		}
		return samples;
	};
