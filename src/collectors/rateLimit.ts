/**
 * Collector for `@absolutejs/rate-limit`'s rate-limiter metrics.
 *
 * The rate-limit package's surface includes per-algorithm counters
 * (allow / block / drift / etc.) — we accept a flexible shape and
 * emit whichever counters are present.
 */

import { counter, gauge, type MetricCollector, type MetricSample } from '../index';

export type RateLimitMetricsShape = {
	allow?: number;
	block?: number;
	drift?: number;
	rps?: number;
	store?: { entries?: number; capacity?: number };
};

export type RateLimitCollectorOptions = {
	/** Static labels (e.g. `{ limiter: 'api' }` when you run >1 in the same process). */
	labels?: Record<string, string>;
};

export const rateLimitCollector = (
	source: () => RateLimitMetricsShape | Promise<RateLimitMetricsShape>,
	options: RateLimitCollectorOptions = {}
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];
	const labels = options.labels;
	const tagged = (extra: Record<string, string>) => ({ ...(labels ?? {}), ...extra });

	if (m.allow !== undefined) {
		samples.push(counter('abs_rate_limit_decisions_total', m.allow, {
			help: 'Rate-limit decisions',
			labels: tagged({ decision: 'allow' })
		}));
	}
	if (m.block !== undefined) {
		samples.push(counter('abs_rate_limit_decisions_total', m.block, {
			help: 'Rate-limit decisions',
			labels: tagged({ decision: 'block' })
		}));
	}
	if (m.drift !== undefined) {
		samples.push(counter('abs_rate_limit_drift_total', m.drift, {
			help: 'Decisions that bypassed the limiter due to clock drift',
			...(labels !== undefined ? { labels } : {})
		}));
	}
	if (m.rps !== undefined) {
		samples.push(gauge('abs_rate_limit_rps', m.rps, {
			help: 'Approximate requests-per-second through the limiter',
			...(labels !== undefined ? { labels } : {})
		}));
	}
	if (m.store?.entries !== undefined) {
		samples.push(gauge('abs_rate_limit_store_entries', m.store.entries, {
			help: 'Active entries in the rate-limit store',
			...(labels !== undefined ? { labels } : {})
		}));
	}
	if (m.store?.capacity !== undefined) {
		samples.push(gauge('abs_rate_limit_store_capacity', m.store.capacity, {
			help: 'Configured rate-limit store capacity',
			...(labels !== undefined ? { labels } : {})
		}));
	}
	return samples;
};
