/**
 * Collector for `@absolutejs/audit` `Audit.metrics()` shape.
 */

import { counter, type MetricCollector, type MetricSample } from '../index';

export type AuditMetricsShape = {
	appended?: number;
	appendErrors?: number;
	sinkErrors?: Record<string, number>;
};

export const auditCollector = (
	source: () => AuditMetricsShape | Promise<AuditMetricsShape>
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];

	if (m.appended !== undefined) {
		samples.push(counter('abs_audit_appended_total', m.appended, {
			help: 'Successful audit.append() calls'
		}));
	}
	if (m.appendErrors !== undefined) {
		samples.push(counter('abs_audit_append_errors_total', m.appendErrors, {
			help: 'audit.append() calls where at least one sink threw'
		}));
	}
	if (m.sinkErrors !== undefined) {
		for (const [sink, count] of Object.entries(m.sinkErrors)) {
			samples.push(counter('abs_audit_sink_errors_total', count, {
				help: 'Per-sink error count',
				labels: { sink }
			}));
		}
	}
	return samples;
};
