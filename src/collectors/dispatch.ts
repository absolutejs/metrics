/**
 * Collector for `@absolutejs/dispatch` `Dispatcher.metrics()` shape.
 */

import { counter, type MetricCollector, type MetricSample } from '../index';

export type DispatchMetricsShape = {
	sent?: number;
	failed?: number;
	byChannel?: Record<string, { sent?: number; failed?: number }>;
};

export const dispatchCollector = (
	source: () => DispatchMetricsShape | Promise<DispatchMetricsShape>
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];

	if (m.sent !== undefined) {
		samples.push(counter('abs_dispatch_sent_total', m.sent, {
			help: 'Total dispatch.send calls that succeeded'
		}));
	}
	if (m.failed !== undefined) {
		samples.push(counter('abs_dispatch_failed_total', m.failed, {
			help: 'Total dispatch.send calls that failed'
		}));
	}
	if (m.byChannel !== undefined) {
		for (const [channel, counts] of Object.entries(m.byChannel)) {
			if (counts.sent !== undefined) {
				samples.push(counter('abs_dispatch_channel_sent_total', counts.sent, {
					help: 'Successful sends per channel',
					labels: { channel }
				}));
			}
			if (counts.failed !== undefined) {
				samples.push(counter('abs_dispatch_channel_failed_total', counts.failed, {
					help: 'Failed sends per channel',
					labels: { channel }
				}));
			}
		}
	}
	return samples;
};
