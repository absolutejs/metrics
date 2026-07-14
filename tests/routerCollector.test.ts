import { describe, expect, test } from 'bun:test';
import { routerCollector } from '../src/collectors/router';

describe('routerCollector', () => {
	test('translates router metrics with bounded decision and shard labels', async () => {
		const collect = routerCollector(() => ({
			acquires: 8,
			lastRouteMs: 3,
			rejectsByDecision: {
				capped: 2,
				'no-tenant-shards': 1
			},
			routes: 12,
			shardLoadDistribution: {
				'studio-a': 5,
				'studio-b': 4
			}
		}));
		const samples = await collect();

		expect(samples).toContainEqual(
			expect.objectContaining({
				name: 'abs_router_routes_total',
				value: 12
			})
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				labels: { decision: 'no-tenant-shards' },
				name: 'abs_router_rejections_total',
				value: 1
			})
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				labels: { shard: 'studio-a' },
				name: 'abs_router_shard_routes_total',
				value: 5
			})
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				name: 'abs_router_last_route_ms',
				value: 3
			})
		);
		expect(
			samples.every((sample) => sample.labels?.tenant === undefined)
		).toBe(true);
	});

	test('supports async partial sources', async () => {
		const collect = routerCollector(async () => ({ routes: 4 }));

		expect(await collect()).toEqual([
			expect.objectContaining({
				name: 'abs_router_routes_total',
				value: 4
			})
		]);
	});
});
