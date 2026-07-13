/**
 * Tests for the `@absolutejs/metrics/logs` collector — fed a fake
 * `logger.metrics()` snapshot (LoggerMetrics shape).
 */
import { describe, expect, test } from 'bun:test';
import { renderPrometheus } from '../src/index';
import { logsCollector } from '../src/collectors/logs';

describe('logsCollector', () => {
	test('emits per-level counters + writes + write errors + per-sink errors', async () => {
		const samples = await logsCollector(() => ({
			logged: {
				debug: 10,
				error: 3,
				fatal: 0,
				info: 200,
				trace: 0,
				warn: 12
			},
			sinkErrors: { 'console-json': 0, loki: 2 },
			writeErrors: 2,
			writes: 448
		}))();

		const emitted = samples.filter(
			(s) => s.name === 'abs_logs_emitted_total'
		);
		expect(emitted).toHaveLength(6);
		expect(emitted.find((s) => s.labels?.level === 'info')?.value).toBe(
			200
		);
		expect(emitted.find((s) => s.labels?.level === 'error')?.value).toBe(3);

		expect(
			samples.find((s) => s.name === 'abs_logs_writes_total')?.value
		).toBe(448);
		expect(
			samples.find((s) => s.name === 'abs_logs_write_errors_total')?.value
		).toBe(2);

		const sinkErrors = samples.filter(
			(s) => s.name === 'abs_logs_sink_errors_total'
		);
		expect(sinkErrors).toHaveLength(2);
		expect(sinkErrors.find((s) => s.labels?.sink === 'loki')?.value).toBe(
			2
		);
	});

	test('all emitted samples are counters ending in _total', async () => {
		const samples = await logsCollector(() => ({
			logged: { info: 1 },
			sinkErrors: { stdout: 0 },
			writeErrors: 0,
			writes: 1
		}))();
		for (const s of samples) {
			expect(s.type).toBe('counter');
			expect(s.name.endsWith('_total')).toBe(true);
		}
	});

	test("skips fields that aren't reported", async () => {
		const samples = await logsCollector(() => ({ writes: 5 }))();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.name).toBe('abs_logs_writes_total');
	});

	test('renders as Prometheus text — one HELP/TYPE block per name, labeled rows', async () => {
		const samples = await logsCollector(() => ({
			logged: { error: 1, info: 9 },
			sinkErrors: { loki: 2 },
			writeErrors: 2,
			writes: 20
		}))();
		const text = renderPrometheus(samples);
		expect(
			text.match(/# TYPE abs_logs_emitted_total counter/g) ?? []
		).toHaveLength(1);
		expect(text).toContain('abs_logs_emitted_total{level="info"} 9');
		expect(text).toContain('abs_logs_emitted_total{level="error"} 1');
		expect(text).toContain('abs_logs_writes_total 20');
		expect(text).toContain('abs_logs_sink_errors_total{sink="loki"} 2');
	});
});
