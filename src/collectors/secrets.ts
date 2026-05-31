/**
 * Collector for `@absolutejs/secrets` `SecretBroker.metrics()` shape.
 */

import { counter, gauge, type MetricCollector, type MetricSample } from '../index';

export type SecretsMetricsShape = {
	resolves?: number;
	resolveHits?: number;
	resolveMisses?: number;
	resolveErrors?: number;
	rotates?: number;
	rotateErrors?: number;
	invalidations?: number;
	redactCalls?: number;
	redactsApplied?: number;
	cacheEntries?: number;
};

export const secretsCollector = (
	source: () => SecretsMetricsShape | Promise<SecretsMetricsShape>
): MetricCollector => async () => {
	const m = await source();
	const samples: MetricSample[] = [];
	const push = (
		factory: typeof counter | typeof gauge,
		name: string,
		value: number | undefined,
		help: string
	) => {
		if (value === undefined) return;
		samples.push(factory(name, value, { help }));
	};

	push(counter, 'abs_secrets_resolves_total', m.resolves, 'Total broker.resolve() calls');
	push(counter, 'abs_secrets_resolve_hits_total', m.resolveHits, 'resolve() calls served from cache');
	push(counter, 'abs_secrets_resolve_misses_total', m.resolveMisses, 'resolve() calls that hit the adapter');
	push(counter, 'abs_secrets_resolve_errors_total', m.resolveErrors, 'resolve() calls where the adapter threw');
	push(counter, 'abs_secrets_rotates_total', m.rotates, 'Successful rotate() calls');
	push(counter, 'abs_secrets_rotate_errors_total', m.rotateErrors, 'rotate() calls where the adapter threw');
	push(counter, 'abs_secrets_invalidations_total', m.invalidations, 'Cache invalidation calls');
	push(counter, 'abs_secrets_redact_calls_total', m.redactCalls, 'redact() calls (any input length)');
	push(counter, 'abs_secrets_redacts_applied_total', m.redactsApplied, 'Distinct (secret, encoding) pairs that triggered a replacement');
	push(gauge, 'abs_secrets_cache_entries', m.cacheEntries, 'Entries currently in the resolve cache');

	return samples;
};
