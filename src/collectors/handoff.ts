/**
 * Collector for `@absolutejs/handoff` recorder metrics.
 *
 * Correlation ids, services, operations, messages, and references are
 * intentionally excluded from labels. Only the package's closed source and
 * outcome vocabularies become Prometheus dimensions.
 */

import type { HandoffMetrics } from '@absolutejs/handoff';
import { counter, type MetricCollector, type MetricSample } from '../index';

export type HandoffMetricsShape = Partial<
	Pick<
		HandoffMetrics,
		'byOutcome' | 'bySource' | 'contradictions' | 'recorded' | 'sinkErrors'
	>
>;

export const handoffCollector =
	(
		source: () => HandoffMetricsShape | Promise<HandoffMetricsShape>
	): MetricCollector =>
	async () => {
		const metrics = await source();
		const samples: MetricSample[] = [];

		if (metrics.recorded !== undefined) {
			samples.push(
				counter('abs_handoff_recorded_total', metrics.recorded, {
					help: 'Privacy-safe handoff evidence observations recorded'
				})
			);
		}
		if (metrics.contradictions !== undefined) {
			samples.push(
				counter(
					'abs_handoff_contradictions_total',
					metrics.contradictions,
					{
						help: 'Handoff summaries with conflicting reported and authoritative outcomes'
					}
				)
			);
		}
		if (metrics.sinkErrors !== undefined) {
			samples.push(
				counter('abs_handoff_sink_errors_total', metrics.sinkErrors, {
					help: 'Handoff evidence observer or store delivery failures'
				})
			);
		}
		for (const [outcome, value] of Object.entries(
			metrics.byOutcome ?? {}
		)) {
			samples.push(
				counter('abs_handoff_outcomes_total', value, {
					help: 'Handoff evidence observations by bounded outcome',
					labels: { outcome }
				})
			);
		}
		for (const [source, value] of Object.entries(metrics.bySource ?? {})) {
			samples.push(
				counter('abs_handoff_sources_total', value, {
					help: 'Handoff evidence observations by bounded source',
					labels: { source }
				})
			);
		}

		return samples;
	};
