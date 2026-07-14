import { describe, expect, test } from 'bun:test';
import { egressCollector } from '../src/collectors/egress';

describe('egressCollector', () => {
	test('translates the runtime egress guard metrics without tenant labels', async () => {
		const collect = egressCollector(() => ({
			bytesEgress: 8192,
			denied: {
				'bytes-budget': 2,
				'not-allowed': 3,
				'requests-budget': 1
			},
			requests: 17,
			tenants: 4
		}));
		const samples = await collect();

		expect(samples).toContainEqual(
			expect.objectContaining({ name: 'abs_egress_tenants', value: 4 })
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				name: 'abs_egress_requests_total',
				value: 17
			})
		);
		expect(samples).toContainEqual(
			expect.objectContaining({ name: 'abs_egress_bytes_total', value: 8192 })
		);
		expect(samples).toContainEqual(
			expect.objectContaining({
				labels: { reason: 'not-allowed' },
				name: 'abs_egress_denied_total',
				value: 3
			})
		);
		expect(samples.every((sample) => sample.labels?.tenant === undefined)).toBe(
			true
		);
	});
});
