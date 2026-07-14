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

import {
	counter,
	gauge,
	type MetricCollector,
	type MetricSample
} from '../index';

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

export type WakeSchedulerMetricsShape = {
	draining?: boolean;
	enabled?: number;
	entries?: number;
	errors?: number;
	firings?: number;
	lastTickMs?: number;
	missedSkipped?: number;
	skippedTicks?: number;
};

export const queueCollector =
	(
		source: () => QueueMetricsShape | Promise<QueueMetricsShape>,
		options: QueueCollectorOptions = {}
	): MetricCollector =>
	async () => {
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
			samples.push(
				factory(name, value, { help, ...(labels ? { labels } : {}) })
			);
		};

		push(gauge, 'abs_queue_active', m.active, 'Handlers currently running');
		push(
			gauge,
			'abs_queue_capacity',
			m.capacity,
			'Configured concurrency cap'
		);
		push(
			gauge,
			'abs_queue_draining',
			m.draining === undefined ? undefined : m.draining ? 1 : 0,
			'1 if the worker has been drained; 0 otherwise'
		);
		push(
			counter,
			'abs_queue_runs_total',
			m.runs,
			'Total handler invocations'
		);
		push(
			counter,
			'abs_queue_completed_total',
			m.completed,
			'Successful job completions'
		);
		push(
			counter,
			'abs_queue_failed_total',
			m.failed,
			'Failed job attempts'
		);
		push(
			counter,
			'abs_queue_retried_total',
			m.retried,
			'Jobs scheduled for retry'
		);
		push(
			counter,
			'abs_queue_dead_lettered_total',
			m.deadLettered,
			'Jobs that exhausted maxAttempts'
		);
		push(
			counter,
			'abs_queue_polls_total',
			m.polls,
			'Worker tick() invocations'
		);
		push(
			counter,
			'abs_queue_reaped_total',
			m.reaped,
			'Stuck-lease reaps performed'
		);
		push(
			gauge,
			'abs_queue_last_tick_ms',
			m.lastTickMs,
			'Wall-clock duration of the most recent tick()'
		);

		return samples;
	};

/** Collector for `@absolutejs/queue`'s `WakeScheduler.metrics()` shape. */
export const wakeSchedulerCollector =
	(
		source: () =>
			| WakeSchedulerMetricsShape
			| Promise<WakeSchedulerMetricsShape>,
		options: QueueCollectorOptions = {}
	): MetricCollector =>
	async () => {
		const metrics = await source();
		const samples: MetricSample[] = [];
		const labels = options.labels;
		const push = (
			factory: typeof counter | typeof gauge,
			name: string,
			value: number | undefined,
			help: string
		) => {
			if (value === undefined) return;
			samples.push(
				factory(name, value, { help, ...(labels ? { labels } : {}) })
			);
		};

		push(
			gauge,
			'abs_queue_wake_entries',
			metrics.entries,
			'Configured wake schedules'
		);
		push(
			gauge,
			'abs_queue_wake_enabled',
			metrics.enabled,
			'Enabled wake schedules'
		);
		push(
			gauge,
			'abs_queue_wake_draining',
			metrics.draining === undefined
				? undefined
				: metrics.draining
					? 1
					: 0,
			'1 if the wake scheduler is draining; 0 otherwise'
		);
		push(
			counter,
			'abs_queue_wake_firings_total',
			metrics.firings,
			'Wake firings'
		);
		push(
			counter,
			'abs_queue_wake_errors_total',
			metrics.errors,
			'Failed wake firings'
		);
		push(
			counter,
			'abs_queue_wake_missed_skipped_total',
			metrics.missedSkipped,
			'Missed wake firings skipped during catch-up'
		);
		push(
			counter,
			'abs_queue_wake_skipped_ticks_total',
			metrics.skippedTicks,
			'Wake scheduler ticks skipped due to overlap'
		);
		push(
			gauge,
			'abs_queue_wake_last_tick_ms',
			metrics.lastTickMs,
			'Wall-clock duration of the most recent wake tick()'
		);

		return samples;
	};
