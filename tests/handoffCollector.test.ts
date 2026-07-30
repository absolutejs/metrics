import { describe, expect, test } from 'bun:test';
import { handoffCollector } from '../src/collectors/handoff';

describe('handoffCollector', () => {
	test('exports bounded outcomes and sources without correlation labels', async () => {
		const samples = await handoffCollector(() => ({
			byOutcome: {
				failed: 1,
				pending: 0,
				started: 1,
				succeeded: 2,
				unknown: 0
			},
			bySource: {
				callback: 2,
				external_api: 1,
				external_surface_report: 1,
				host: 0,
				reconciliation: 0
			},
			contradictions: 1,
			recorded: 4,
			sinkErrors: 0
		}))();

		expect(samples).toContainEqual(
			expect.objectContaining({
				name: 'abs_handoff_recorded_total',
				value: 4
			})
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				labels: { outcome: 'succeeded' },
				name: 'abs_handoff_outcomes_total',
				value: 2
			})
		);
		expect(JSON.stringify(samples)).not.toContain('correlation');
	});
});
