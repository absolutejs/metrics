/**
 * Collector for `@absolutejs/errors`' `tracker.metrics()` shape
 * (`ErrorTrackerMetrics`).
 *
 * Usage:
 *
 *   import { errorsCollector } from '@absolutejs/metrics/errors';
 *   registry.register('errors', errorsCollector(() => tracker.metrics()));
 */

import {
	counter,
	gauge,
	type MetricCollector,
	type MetricSample
} from '../index';

/** Narrow subset of `tracker.metrics()` we read. */
export type ErrorsMetricsShape = {
	captured?: number;
	captureErrors?: number;
	byFingerprint?: Record<string, number>;
};

export const errorsCollector =
	(
		source: () => ErrorsMetricsShape | Promise<ErrorsMetricsShape>
	): MetricCollector =>
	async () => {
		const m = await source();
		const samples: MetricSample[] = [];

		if (m.captured !== undefined) {
			samples.push(
				counter('abs_errors_captured_total', m.captured, {
					help: 'Successful tracker.capture() calls'
				})
			);
		}
		if (m.captureErrors !== undefined) {
			samples.push(
				counter('abs_errors_capture_errors_total', m.captureErrors, {
					help: 'Per-sink failures across all captures'
				})
			);
		}
		if (m.byFingerprint !== undefined) {
			/* Distinct count only — fingerprints are content-derived and
			 * effectively unbounded, so per-fingerprint labels would be a
			 * Prometheus cardinality anti-pattern (unlike the bounded,
			 * operator-defined key sets other collectors label on, e.g.
			 * audit sinks or dispatch channels). */
			samples.push(
				gauge(
					'abs_errors_fingerprints',
					Object.keys(m.byFingerprint).length,
					{
						help: 'Distinct error fingerprints tracked (capped at maxFingerprints)'
					}
				)
			);
		}
		return samples;
	};
