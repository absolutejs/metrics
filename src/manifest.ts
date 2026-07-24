import { defineManifest, toolFactory } from '@absolutejs/manifest';
import { Type } from '@sinclair/typebox';
import type { MetricsPluginOptions, MetricsRegistry } from './index';

const tool = toolFactory<MetricsRegistry>();

/* Serializable subset of MetricsPluginOptions: `path` only. The `registry`
 * (and the collectors registered on it) are instance/function-valued →
 * wiring concerns; `makeElysia` is a test seam. */
export const manifest = defineManifest<MetricsPluginOptions, MetricsRegistry>()(
	{
		contract: 2,
		identity: {
			accent: '#0ea5e9',
			category: 'observability',
			description:
				'Prometheus / OpenMetrics exposure for the AbsoluteJS substrate: every package’s `metrics()` snapshot becomes `MetricSample[]` via per-source collectors (`@absolutejs/metrics/queue`, `/runtime`, `/sync`, …), and `metricsPlugin` serves the rendered text format for scrapers.',
			docsUrl: 'https://github.com/absolutejs/metrics',
			name: '@absolutejs/metrics',
			tagline:
				'Publish live performance counters for dashboards and alerts.'
		},
		requires: {
			peers: [
				{ name: 'elysia', range: '>=1.4.29 <2', reason: 'plugin host' }
			]
		},
		settings: Type.Object({
			path: Type.Optional(
				Type.String({
					description:
						'Address where the counters are published for scrapers like Prometheus. Default is /metrics.',
					examples: ['/metrics'],
					title: 'Metrics page address'
				})
			)
		}),
		tools: {
			list_metric_sources: tool.runtime({
				annotations: { readOnlyHint: true },
				authorization: {
					approval: 'never',
					audience: 'admin',
					effects: ['read'],
					requiredScopes: ['metrics:read']
				},
				description:
					'List which metric sources (collectors) are currently registered.',
				handler: (_input, registry) => {
					const sources = registry.sources();

					return sources.length === 0
						? 'no metric collectors registered'
						: JSON.stringify(sources);
				},
				input: Type.Object({})
			}),
			read_metrics: tool.runtime({
				annotations: { readOnlyHint: true },
				authorization: {
					approval: 'never',
					audience: 'admin',
					effects: ['read'],
					requiredScopes: ['metrics:read']
				},
				description:
					'Read the current values of every registered counter and gauge, rendered as Prometheus text (one line per metric with HELP/TYPE comments).',
				handler: async (_input, registry) => {
					const body = await registry.render();

					return body === '' ? 'no metrics collected yet' : body;
				},
				input: Type.Object({})
			})
		},
		wiring: [
			{
				description:
					'Create a registry, register a collector per package you want exposed, and serve the Prometheus text endpoint.',
				id: 'default',
				server: {
					code: [
						'const metricsRegistry = createMetricsRegistry();',
						'// TODO: register a collector per source, e.g.',
						"//   metricsRegistry.register('queue', queueCollector(() => worker.metrics()));",
						'',
						'// Mount with .use(metricsRoute) to expose the metrics page.',
						'const metricsRoute = await metricsPlugin({ path: ${settings.path}, registry: metricsRegistry });'
					].join('\n'),
					imports: [
						{
							from: '@absolutejs/metrics',
							names: ['createMetricsRegistry', 'metricsPlugin']
						}
					],
					placement: 'module-scope'
				},
				title: 'Expose a Prometheus metrics endpoint'
			}
		]
	}
);
