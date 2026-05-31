/**
 * @absolutejs/metrics — Prometheus / OpenMetrics exposure for the
 * AbsoluteJS substrate.
 *
 * The substrate already wears its instrumentation on its sleeve: every
 * package exposes a `metrics()` method returning a typed snapshot.
 * What's missing is the **last mile** — converting those shapes into
 * the Prometheus text format so scrapers can read them.
 *
 * Shape:
 *
 *   1. **`MetricSample`** is the small intermediate format: a
 *      `{ name, value, type, help?, labels? }` shape that maps cleanly
 *      to Prometheus / OpenMetrics output.
 *   2. **`MetricCollector`** is a function returning `MetricSample[]`.
 *      Per-source collectors translate each substrate package's
 *      `metrics()` output into samples; the registry composes them.
 *   3. **`createMetricsRegistry()`** holds a set of named collectors,
 *      calls them on demand, and renders the combined output.
 *   4. **`metricsPlugin({ registry, path })`** is the Elysia plugin —
 *      `GET <path>` returns the rendered text with the right
 *      `Content-Type`.
 *
 * The collectors live in subpaths (`@absolutejs/metrics/runtime`,
 * `@absolutejs/metrics/queue`, …) so the core library has no hard
 * dependencies on the substrate packages it instruments.
 */

// =============================================================================
// Sample format — the intermediate shape every collector emits
// =============================================================================

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'untyped';

/**
 * One emission of one metric. Collectors return an array of these;
 * the registry renders them as Prometheus text.
 *
 * Label values are escaped per Prometheus text format. Label keys
 * must match `[a-zA-Z_][a-zA-Z0-9_]*`.
 */
export type MetricSample = {
	/** Metric name. Prometheus convention: `abs_<source>_<metric>` (lowercase, snake_case). */
	name: string;
	/** Numeric value. Counters MUST be monotonically non-decreasing; gauges may go up/down. */
	value: number;
	/** Metric type — emitted as `# TYPE` on first appearance. */
	type: MetricType;
	/** Human-readable description — emitted as `# HELP` on first appearance. */
	help?: string;
	/** Label key→value pairs. Values are escaped. */
	labels?: Record<string, string>;
};

/**
 * A collector is just a function that returns samples. Sync or async.
 * Per-source collectors take a `() => SourceMetrics` callback so the
 * core library never has a hard dep on the source package.
 */
export type MetricCollector = () => Promise<MetricSample[]> | MetricSample[];

// =============================================================================
// Registry
// =============================================================================

export type MetricsRegistry = {
	/**
	 * Add a collector. The `source` name is for debugging only — samples
	 * use their own `name` field for output. Re-adding under the same
	 * source replaces the previous collector.
	 */
	register: (source: string, collector: MetricCollector) => void;
	/** Remove a collector by source name. */
	unregister: (source: string) => void;
	/** Call every collector and return the flattened sample list. */
	collect: () => Promise<MetricSample[]>;
	/** Render every collector's output as Prometheus text. */
	render: () => Promise<string>;
	/** Operator visibility: which sources are wired right now. */
	sources: () => string[];
};

export const createMetricsRegistry = (): MetricsRegistry => {
	const collectors = new Map<string, MetricCollector>();

	return {
		collect: async () => {
			const out: MetricSample[] = [];
			for (const [, collector] of collectors) {
				const samples = await collector();
				for (const sample of samples) out.push(sample);
			}
			return out;
		},
		register: (source, collector) => {
			collectors.set(source, collector);
		},
		render: async () => {
			const samples: MetricSample[] = [];
			for (const [, collector] of collectors) {
				const result = await collector();
				for (const sample of result) samples.push(sample);
			}
			return renderPrometheus(samples);
		},
		sources: () => [...collectors.keys()],
		unregister: (source) => {
			collectors.delete(source);
		}
	};
};

// =============================================================================
// Prometheus text-format renderer
// =============================================================================

const NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const escapeLabelValue = (value: string): string =>
	value
		.replaceAll('\\', '\\\\')
		.replaceAll('"', '\\"')
		.replaceAll('\n', '\\n');

const escapeHelp = (text: string): string =>
	text.replaceAll('\\', '\\\\').replaceAll('\n', '\\n');

const formatLabels = (labels: Record<string, string> | undefined): string => {
	if (labels === undefined) return '';
	const entries = Object.entries(labels);
	if (entries.length === 0) return '';
	const parts: string[] = [];
	for (const [key, value] of entries) {
		if (!LABEL_NAME_PATTERN.test(key)) {
			throw new Error(`[metrics] invalid label name "${key}"`);
		}
		parts.push(`${key}="${escapeLabelValue(value)}"`);
	}
	return `{${parts.join(',')}}`;
};

const formatValue = (value: number): string => {
	if (Number.isNaN(value)) return 'NaN';
	if (value === Infinity) return '+Inf';
	if (value === -Infinity) return '-Inf';
	return String(value);
};

/**
 * Render `MetricSample[]` as Prometheus text format. Groups samples
 * by metric name (so `# HELP` and `# TYPE` lines appear once per
 * metric, ahead of all its label-permutations).
 *
 * Output is suitable for the Prometheus scraper's
 * `Content-Type: text/plain; version=0.0.4; charset=utf-8`.
 */
export const renderPrometheus = (samples: MetricSample[]): string => {
	type Group = {
		type: MetricType;
		help?: string;
		rows: string[];
	};
	const groups = new Map<string, Group>();

	for (const sample of samples) {
		if (!NAME_PATTERN.test(sample.name)) {
			throw new Error(
				`[metrics] invalid metric name "${sample.name}" — must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/`
			);
		}
		let group = groups.get(sample.name);
		if (group === undefined) {
			group = { rows: [], type: sample.type };
			if (sample.help !== undefined) group.help = sample.help;
			groups.set(sample.name, group);
		}
		// First-seen type + help win. Later samples with different types are
		// suspicious but tolerable; we don't override.
		if (group.help === undefined && sample.help !== undefined) {
			group.help = sample.help;
		}
		group.rows.push(
			`${sample.name}${formatLabels(sample.labels)} ${formatValue(sample.value)}`
		);
	}

	const out: string[] = [];
	for (const [name, group] of groups) {
		if (group.help !== undefined) {
			out.push(`# HELP ${name} ${escapeHelp(group.help)}`);
		}
		out.push(`# TYPE ${name} ${group.type}`);
		for (const row of group.rows) out.push(row);
	}
	return out.length > 0 ? `${out.join('\n')}\n` : '';
};

export const PROMETHEUS_CONTENT_TYPE =
	'text/plain; version=0.0.4; charset=utf-8';

// =============================================================================
// Elysia plugin
// =============================================================================

/**
 * Minimal subset of Elysia we touch. Avoids a hard import — the
 * `elysia` peer dep is optional.
 */
type ElysiaLike = {
	get: (
		path: string,
		handler: () => Promise<Response> | Response
	) => ElysiaLike;
};

export type MetricsPluginOptions = {
	registry: MetricsRegistry;
	/** Default `'/metrics'`. */
	path?: string;
	/**
	 * Optional Elysia factory. If omitted we dynamically import `elysia`.
	 * Inject a mock for tests.
	 */
	makeElysia?: () => ElysiaLike;
};

/**
 * Build an Elysia plugin exposing `GET <path>` rendering Prometheus
 * text. Mount with `app.use(metricsPlugin({ registry }))`.
 *
 * Async-by-construction so we can dynamically import Elysia (avoids
 * pulling it into bundles that don't need HTTP exposure).
 */
export const metricsPlugin = async (
	options: MetricsPluginOptions
): Promise<ElysiaLike> => {
	const path = options.path ?? '/metrics';
	let app: ElysiaLike;
	if (options.makeElysia !== undefined) {
		app = options.makeElysia();
	} else {
		const mod = (await import('elysia')) as { Elysia: new (init?: { name?: string }) => ElysiaLike };
		app = new mod.Elysia({ name: '@absolutejs/metrics' });
	}
	app.get(path, async () => {
		try {
			const body = await options.registry.render();
			return new Response(body, {
				headers: {
					'cache-control': 'no-store',
					'content-type': PROMETHEUS_CONTENT_TYPE
				}
			});
		} catch (error) {
			return new Response(
				`# metrics collection failed: ${error instanceof Error ? error.message : String(error)}\n`,
				{
					headers: { 'content-type': PROMETHEUS_CONTENT_TYPE },
					status: 500
				}
			);
		}
	});
	return app;
};

// =============================================================================
// Helpers re-exported for collector authors
// =============================================================================

/** Build a counter sample. Convenience for collector authors. */
export const counter = (
	name: string,
	value: number,
	options: { help?: string; labels?: Record<string, string> } = {}
): MetricSample => ({
	name,
	type: 'counter',
	value,
	...(options.help !== undefined ? { help: options.help } : {}),
	...(options.labels !== undefined ? { labels: options.labels } : {})
});

/** Build a gauge sample. Convenience for collector authors. */
export const gauge = (
	name: string,
	value: number,
	options: { help?: string; labels?: Record<string, string> } = {}
): MetricSample => ({
	name,
	type: 'gauge',
	value,
	...(options.help !== undefined ? { help: options.help } : {}),
	...(options.labels !== undefined ? { labels: options.labels } : {})
});
