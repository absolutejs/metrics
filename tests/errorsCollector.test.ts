/**
 * Tests for the `@absolutejs/metrics/errors` collector — fed a fake
 * `tracker.metrics()` snapshot (ErrorTrackerMetrics shape).
 */
import { describe, expect, test } from 'bun:test';
import { renderPrometheus } from '../src/index';
import { errorsCollector } from '../src/collectors/errors';

describe('errorsCollector', () => {
	test('emits captured + capture-error counters and fingerprint gauge', async () => {
		const samples = await errorsCollector(() => ({
			byFingerprint: { abc123: 40, def456: 55, fee789: 5 },
			captureErrors: 2,
			captured: 100
		}))();
		const byName: Record<string, number> = {};
		for (const s of samples) byName[s.name] = s.value;
		expect(byName.abs_errors_captured_total).toBe(100);
		expect(byName.abs_errors_capture_errors_total).toBe(2);
		expect(byName.abs_errors_fingerprints).toBe(3);
	});

	test('byFingerprint emits the distinct count, never per-fingerprint labels', async () => {
		const samples = await errorsCollector(() => ({
			byFingerprint: { a: 1, b: 2 }
		}))();
		expect(samples).toHaveLength(1);
		const fingerprints = samples[0];
		expect(fingerprints?.name).toBe('abs_errors_fingerprints');
		expect(fingerprints?.type).toBe('gauge');
		expect(fingerprints?.value).toBe(2);
		expect(fingerprints?.labels).toBeUndefined();
	});

	test('counter types end in _total; fingerprint gauge does not', async () => {
		const samples = await errorsCollector(() => ({
			byFingerprint: {},
			captureErrors: 0,
			captured: 1
		}))();
		for (const s of samples) {
			if (s.type === 'counter')
				expect(s.name.endsWith('_total')).toBe(true);
			if (s.type === 'gauge')
				expect(s.name.endsWith('_total')).toBe(false);
		}
	});

	test("skips fields that aren't reported", async () => {
		const samples = await errorsCollector(() => ({ captured: 7 }))();
		expect(samples).toHaveLength(1);
		expect(samples[0]?.name).toBe('abs_errors_captured_total');
	});

	test('renders as Prometheus text with HELP/TYPE blocks', async () => {
		const samples = await errorsCollector(() => ({
			byFingerprint: { abc: 3 },
			captureErrors: 1,
			captured: 50
		}))();
		const text = renderPrometheus(samples);
		expect(text).toContain('# TYPE abs_errors_captured_total counter');
		expect(text).toContain('abs_errors_captured_total 50');
		expect(text).toContain('abs_errors_capture_errors_total 1');
		expect(text).toContain('# TYPE abs_errors_fingerprints gauge');
		expect(text).toContain('abs_errors_fingerprints 1');
	});
});
