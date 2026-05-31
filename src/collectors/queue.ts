/**
 * Collector for `@absolutejs/queue`'s `QueueWorker.metrics()` shape.
 *
 * Usage:
 *
 *   import { queueCollector } from '@absolutejs/metrics/queue';
 *   registry.register('queue', queueCollector(() => worker.metrics()));
 *
 * For multiple workers, register each under a distinct source name
 * and pass a `labels: { worker: 'email' }` option to differentiate
 * the time series.
 */

import { counter, gauge, type MetricCollector, type MetricSample } from '../index';

export type QueueMetricsShape = {
	active?: number;
	capacity?: number;
	draining?: boolean;
	runs?: number;
	completed?: number;
	failed?: number;
	retried?: number;
	deadLettered?: number;
	polls?: number;
	reaped?: number;
	lastTickMs?: number;
};

export type QueueCollectorOptions = {
	/** Static labels added to every sample (e.g. `{ worker: 'email' }`). */
	labels?: Record<string, string>;
};

export const queueCollector = (
	source: () => QueueMetricsShape | Promise<QueueMetricsShape>,
	options: QueueCollectorOptions = {}
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];
	const labels = options.labels;

	const push = (
		factory: typeof counter | typeof gauge,
		name: string,
		value: number | undefined,
		help: string
	) => {
		if (value === undefined) return;
		samples.push(factory(name, value, { help, ...(labels ? { labels } : {}) }));
	};

	push(gauge, 'abs_queue_active', m.active, 'Handlers currently running');
	push(gauge, 'abs_queue_capacity', m.capacity, 'Configured concurrency cap');
	push(
		gauge,
		'abs_queue_draining',
		m.draining === undefined ? undefined : m.draining ? 1 : 0,
		'1 if the worker has been drained; 0 otherwise'
	);
	push(counter, 'abs_queue_runs_total', m.runs, 'Total handler invocations');
	push(counter, 'abs_queue_completed_total', m.completed, 'Successful job completions');
	push(counter, 'abs_queue_failed_total', m.failed, 'Failed job attempts');
	push(counter, 'abs_queue_retried_total', m.retried, 'Jobs scheduled for retry');
	push(
		counter,
		'abs_queue_dead_lettered_total',
		m.deadLettered,
		'Jobs that exhausted maxAttempts'
	);
	push(counter, 'abs_queue_polls_total', m.polls, 'Worker tick() invocations');
	push(counter, 'abs_queue_reaped_total', m.reaped, 'Stuck-lease reaps performed');
	push(
		gauge,
		'abs_queue_last_tick_ms',
		m.lastTickMs,
		'Wall-clock duration of the most recent tick()'
	);

	return samples;
};
