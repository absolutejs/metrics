/** Collector for `@absolutejs/runtime`'s `createEgressGuard().metrics()`. */

import {
	counter,
	gauge,
	type MetricCollector,
	type MetricSample
} from '../index';

export type EgressMetricsShape = {
	tenants?: number;
	requests?: number;
	denied?: Record<string, number>;
	bytesEgress?: number;
};

export const egressCollector = (
	source: () => EgressMetricsShape | Promise<EgressMetricsShape>
): MetricCollector =>
	async () => {
		const metrics = await source();
		const samples: MetricSample[] = [];
		if (metrics.tenants !== undefined) {
			samples.push(
				gauge('abs_egress_tenants', metrics.tenants, {
					help: 'Tenants tracked by the egress guard'
				})
			);
		}
		if (metrics.requests !== undefined) {
			samples.push(
				counter('abs_egress_requests_total', metrics.requests, {
					help: 'Outbound requests admitted by the egress guard'
				})
			);
		}
		if (metrics.bytesEgress !== undefined) {
			samples.push(
				counter('abs_egress_bytes_total', metrics.bytesEgress, {
					help: 'Outbound response bytes observed by the egress guard'
				})
			);
		}
		if (metrics.denied !== undefined) {
			for (const [reason, value] of Object.entries(metrics.denied)) {
				samples.push(
					counter('abs_egress_denied_total', value, {
						help: 'Outbound requests denied by policy reason',
						labels: { reason }
					})
				);
			}
		}
		return samples;
	};
