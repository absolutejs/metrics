/**
 * Collector for `@absolutejs/router`'s `metrics()` shape.
 *
 * Tenant ids are intentionally absent. Rejection decisions use the router's
 * closed vocabulary, while shard ids are bounded by the operator-configured
 * shard set.
 */

import {
	counter,
	gauge,
	type MetricCollector,
	type MetricSample
} from '../index';

export type RouterMetricsShape = {
	routes?: number;
	acquires?: number;
	rejectsByDecision?: Record<string, number>;
	shardLoadDistribution?: Record<string, number>;
	lastRouteMs?: number;
};

const HELP_ROUTES = 'Total router admission decisions';
const HELP_ACQUIRES = 'Total router connection acquisitions';
const HELP_REJECTS = 'Total rejected routes by admission decision';
const HELP_SHARD_ROUTES = 'Total allowed routes assigned to each shard';
const HELP_LAST_ROUTE =
	'Duration of the most recent route decision in milliseconds';

export const routerCollector =
	(
		source: () => RouterMetricsShape | Promise<RouterMetricsShape>
	): MetricCollector =>
	async () => {
		const metrics = await source();
		const samples: MetricSample[] = [];

		if (metrics.routes !== undefined) {
			samples.push(
				counter('abs_router_routes_total', metrics.routes, {
					help: HELP_ROUTES
				})
			);
		}
		if (metrics.acquires !== undefined) {
			samples.push(
				counter('abs_router_acquires_total', metrics.acquires, {
					help: HELP_ACQUIRES
				})
			);
		}
		if (metrics.rejectsByDecision !== undefined) {
			for (const [decision, value] of Object.entries(
				metrics.rejectsByDecision
			)) {
				samples.push(
					counter('abs_router_rejections_total', value, {
						help: HELP_REJECTS,
						labels: { decision }
					})
				);
			}
		}
		if (metrics.shardLoadDistribution !== undefined) {
			for (const [shard, value] of Object.entries(
				metrics.shardLoadDistribution
			)) {
				samples.push(
					counter('abs_router_shard_routes_total', value, {
						help: HELP_SHARD_ROUTES,
						labels: { shard }
					})
				);
			}
		}
		if (metrics.lastRouteMs !== undefined) {
			samples.push(
				gauge('abs_router_last_route_ms', metrics.lastRouteMs, {
					help: HELP_LAST_ROUTE
				})
			);
		}

		return samples;
	};
