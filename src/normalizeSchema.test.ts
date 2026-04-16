import { expect } from 'chai';
import { normalizeSchema } from './normalizeSchema';

describe('normalizeSchema', () => {
	describe('tuple normalization', () => {
		it('should convert items array to prefixItems', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }, { type: 'number' }],
			};
			const result = normalizeSchema(schema);
			expect(result.prefixItems).to.deep.equal([{ type: 'string' }, { type: 'number' }]);
		});

		it('should set items to false when additionalItems is absent', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }, { type: 'number' }],
			};
			const result = normalizeSchema(schema);
			expect(result.items).to.equal(false);
		});

		it('should convert additionalItems false to items false', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }],
				additionalItems: false,
			};
			const result = normalizeSchema(schema);
			expect(result.items).to.equal(false);
			expect(result).to.not.have.property('additionalItems');
		});

		it('should convert additionalItems true to items true', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }],
				additionalItems: true,
			};
			const result = normalizeSchema(schema);
			expect(result.items).to.equal(true);
			expect(result).to.not.have.property('additionalItems');
		});

		it('should convert additionalItems schema to items schema', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }],
				additionalItems: { type: 'number' },
			};
			const result = normalizeSchema(schema);
			expect(result.items).to.deep.equal({ type: 'number' });
			expect(result).to.not.have.property('additionalItems');
		});

		it('should not modify schemas where items is an object', () => {
			const schema = {
				type: 'array' as const,
				items: { type: 'string' },
			};
			const result = normalizeSchema(schema);
			expect(result.items).to.deep.equal({ type: 'string' });
			expect(result).to.not.have.property('prefixItems');
		});

		it('should not modify schemas already using prefixItems', () => {
			const schema = {
				type: 'array' as const,
				prefixItems: [{ type: 'string' }, { type: 'number' }],
				items: false,
			};
			const result = normalizeSchema(schema);
			expect(result.prefixItems).to.deep.equal([{ type: 'string' }, { type: 'number' }]);
			expect(result.items).to.equal(false);
		});
	});

	describe('deep clone', () => {
		it('should not mutate the original schema', () => {
			const schema = {
				type: 'array' as const,
				items: [{ type: 'string' }, { type: 'number' }],
				additionalItems: false,
			};
			const original = JSON.parse(JSON.stringify(schema));
			normalizeSchema(schema);
			expect(schema).to.deep.equal(original);
		});

		it('should not mutate nested schemas', () => {
			const schema = {
				type: 'object' as const,
				properties: {
					coords: {
						type: 'array',
						items: [{ type: 'number' }, { type: 'number' }],
					},
				},
			};
			const original = JSON.parse(JSON.stringify(schema));
			normalizeSchema(schema);
			expect(schema).to.deep.equal(original);
		});
	});

	describe('recursive descent', () => {
		it('should normalize tuples nested in properties', () => {
			const schema = {
				type: 'object' as const,
				properties: {
					coords: {
						type: 'array',
						items: [{ type: 'number' }, { type: 'number' }],
					},
				},
			};
			const result = normalizeSchema(schema);
			const coords = result.properties!.coords as Record<string, unknown>;
			expect(coords.prefixItems).to.deep.equal([{ type: 'number' }, { type: 'number' }]);
			expect(coords.items).to.equal(false);
		});

		it('should normalize tuples nested in oneOf', () => {
			const schema = {
				oneOf: [
					{
						type: 'array',
						items: [{ type: 'string' }],
						additionalItems: false,
					},
					{
						type: 'array',
						items: [{ type: 'number' }],
					},
				],
			};
			const result = normalizeSchema(schema);
			expect((result.oneOf as any[])[0].prefixItems).to.deep.equal([{ type: 'string' }]);
			expect((result.oneOf as any[])[0].items).to.equal(false);
			expect((result.oneOf as any[])[1].prefixItems).to.deep.equal([{ type: 'number' }]);
			expect((result.oneOf as any[])[1].items).to.equal(false);
		});

		it('should normalize tuples nested in anyOf', () => {
			const schema = {
				anyOf: [
					{
						type: 'array',
						items: [{ type: 'string' }, { type: 'number' }],
					},
				],
			};
			const result = normalizeSchema(schema);
			expect((result.anyOf as any[])[0].prefixItems).to.deep.equal([{ type: 'string' }, { type: 'number' }]);
		});

		it('should normalize tuples nested in allOf', () => {
			const schema = {
				allOf: [
					{
						type: 'array',
						items: [{ type: 'string' }],
						additionalItems: { type: 'number' },
					},
				],
			};
			const result = normalizeSchema(schema);
			expect((result.allOf as any[])[0].prefixItems).to.deep.equal([{ type: 'string' }]);
			expect((result.allOf as any[])[0].items).to.deep.equal({ type: 'number' });
		});

		it('should normalize tuples nested in if/then/else', () => {
			const schema = {
				if: { type: 'array', items: [{ type: 'string' }] },
				then: { type: 'array', items: [{ type: 'string' }, { type: 'number' }] },
				else: { type: 'array', items: [{ type: 'number' }] },
			};
			const result = normalizeSchema(schema);
			expect((result.if as any).prefixItems).to.deep.equal([{ type: 'string' }]);
			expect((result.then as any).prefixItems).to.deep.equal([{ type: 'string' }, { type: 'number' }]);
			expect((result.else as any).prefixItems).to.deep.equal([{ type: 'number' }]);
		});

		it('should normalize tuples nested in not', () => {
			const schema = {
				not: {
					type: 'array',
					items: [{ type: 'string' }],
				},
			};
			const result = normalizeSchema(schema);
			expect((result.not as any).prefixItems).to.deep.equal([{ type: 'string' }]);
		});

		it('should normalize tuples nested in contains', () => {
			const schema = {
				type: 'array' as const,
				contains: {
					type: 'array',
					items: [{ type: 'number' }],
				},
			};
			const result = normalizeSchema(schema);
			expect((result.contains as any).prefixItems).to.deep.equal([{ type: 'number' }]);
		});

		it('should normalize tuples nested in patternProperties', () => {
			const schema = {
				type: 'object' as const,
				patternProperties: {
					'^coord_': {
						type: 'array',
						items: [{ type: 'number' }, { type: 'number' }],
					},
				},
			};
			const result = normalizeSchema(schema);
			const coordProp = (result.patternProperties as any)['^coord_'];
			expect(coordProp.prefixItems).to.deep.equal([{ type: 'number' }, { type: 'number' }]);
		});

		it('should normalize tuples nested in dependentSchemas', () => {
			const schema = {
				type: 'object' as const,
				dependentSchemas: {
					coords: {
						properties: {
							coords: {
								type: 'array',
								items: [{ type: 'number' }],
							},
						},
					},
				},
			};
			const result = normalizeSchema(schema);
			const coordsProp = (result.dependentSchemas as any).coords.properties.coords;
			expect(coordsProp.prefixItems).to.deep.equal([{ type: 'number' }]);
		});

		it('should normalize tuples nested in $defs', () => {
			const schema = {
				$defs: {
					Coord: {
						type: 'array',
						items: [{ type: 'number' }, { type: 'number' }],
					},
				},
				$ref: '#/$defs/Coord',
			};
			const result = normalizeSchema(schema);
			expect((result.$defs as any).Coord.prefixItems).to.deep.equal([{ type: 'number' }, { type: 'number' }]);
		});

		it('should normalize tuples nested in legacy definitions', () => {
			const schema = {
				definitions: {
					Coord: {
						type: 'array',
						items: [{ type: 'number' }, { type: 'number' }],
					},
				},
				$ref: '#/definitions/Coord',
			};
			const result = normalizeSchema(schema);
			expect((result.definitions as any).Coord.prefixItems).to.deep.equal([{ type: 'number' }, { type: 'number' }]);
		});

		it('should normalize deeply nested tuples', () => {
			const schema = {
				type: 'object' as const,
				properties: {
					wrapper: {
						type: 'object',
						properties: {
							inner: {
								type: 'array',
								items: [{ type: 'string' }],
								additionalItems: false,
							},
						},
					},
				},
			};
			const result = normalizeSchema(schema);
			const inner = (result.properties as any).wrapper.properties.inner;
			expect(inner.prefixItems).to.deep.equal([{ type: 'string' }]);
			expect(inner.items).to.equal(false);
			expect(inner).to.not.have.property('additionalItems');
		});
	});
});
