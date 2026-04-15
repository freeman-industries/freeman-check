import { expect } from 'chai';
import { extractFieldName, formatProblem, normalizeErrors, formatMessage } from './formatErrors';
import type { ErrorObject } from 'ajv';

/**
 * Creates a mock AJV ErrorObject for testing.
 */
function mockError(overrides: Partial<ErrorObject> & { keyword: string }): ErrorObject {
	return {
		instancePath: '',
		schemaPath: '',
		params: {},
		message: '',
		...overrides,
	} as ErrorObject;
}

describe('extractFieldName', () => {
	describe('simple property paths', () => {
		it('should return "value" for empty instancePath (root-level)', () => {
			const error = mockError({ keyword: 'type', instancePath: '' });
			expect(extractFieldName(error)).to.equal('value');
		});

		it('should extract a top-level field name', () => {
			const error = mockError({ keyword: 'type', instancePath: '/email' });
			expect(extractFieldName(error)).to.equal('email');
		});

		it('should extract a nested field with dot notation', () => {
			const error = mockError({ keyword: 'type', instancePath: '/event/type' });
			expect(extractFieldName(error)).to.equal('event.type');
		});

		it('should extract a deeply nested field', () => {
			const error = mockError({ keyword: 'type', instancePath: '/config/nested/deep/value' });
			expect(extractFieldName(error)).to.equal('config.nested.deep.value');
		});
	});

	describe('array index paths (bracket notation)', () => {
		it('should convert array index to bracket notation', () => {
			const error = mockError({ keyword: 'type', instancePath: '/tags/0' });
			expect(extractFieldName(error)).to.equal('tags[0]');
		});

		it('should handle array item with nested property', () => {
			const error = mockError({ keyword: 'format', instancePath: '/users/0/email' });
			expect(extractFieldName(error)).to.equal('users[0].email');
		});

		it('should handle multiple array indices', () => {
			const error = mockError({ keyword: 'type', instancePath: '/matrix/0/items/1' });
			expect(extractFieldName(error)).to.equal('matrix[0].items[1]');
		});

		it('should handle double-digit array indices', () => {
			const error = mockError({ keyword: 'type', instancePath: '/items/12' });
			expect(extractFieldName(error)).to.equal('items[12]');
		});

		it('should handle root-level array index', () => {
			const error = mockError({ keyword: 'type', instancePath: '/0/email' });
			expect(extractFieldName(error)).to.equal('[0].email');
		});
	});

	describe('required keyword (missingProperty in params)', () => {
		it('should use missingProperty for root-level required', () => {
			const error = mockError({
				keyword: 'required',
				instancePath: '',
				params: { missingProperty: 'email' },
			});
			expect(extractFieldName(error)).to.equal('email');
		});

		it('should prepend parent path for nested required', () => {
			const error = mockError({
				keyword: 'required',
				instancePath: '/event',
				params: { missingProperty: 'type' },
			});
			expect(extractFieldName(error)).to.equal('event.type');
		});

		it('should handle array parent for required', () => {
			const error = mockError({
				keyword: 'required',
				instancePath: '/users/0',
				params: { missingProperty: 'email' },
			});
			expect(extractFieldName(error)).to.equal('users[0].email');
		});

		it('should handle deeply nested required', () => {
			const error = mockError({
				keyword: 'required',
				instancePath: '/event/metadata',
				params: { missingProperty: 'path' },
			});
			expect(extractFieldName(error)).to.equal('event.metadata.path');
		});
	});

	describe('additionalProperties keyword', () => {
		it('should use additionalProperty for root-level extra property', () => {
			const error = mockError({
				keyword: 'additionalProperties',
				instancePath: '',
				params: { additionalProperty: 'extra' },
			});
			expect(extractFieldName(error)).to.equal('extra');
		});

		it('should prepend parent path for nested extra property', () => {
			const error = mockError({
				keyword: 'additionalProperties',
				instancePath: '/event',
				params: { additionalProperty: 'unknown' },
			});
			expect(extractFieldName(error)).to.equal('event.unknown');
		});

		it('should handle array parent for additional property', () => {
			const error = mockError({
				keyword: 'additionalProperties',
				instancePath: '/users/0',
				params: { additionalProperty: 'extra' },
			});
			expect(extractFieldName(error)).to.equal('users[0].extra');
		});
	});
});

describe('formatProblem', () => {
	describe('preserved keywords (backwards-compatible)', () => {
		it('should format additionalProperties', () => {
			const error = mockError({ keyword: 'additionalProperties', params: { additionalProperty: 'x' } });
			expect(formatProblem(error)).to.equal('is not allowed');
		});

		it('should format required', () => {
			const error = mockError({ keyword: 'required', params: { missingProperty: 'email' } });
			expect(formatProblem(error)).to.equal('is missing');
		});

		it('should format format keyword', () => {
			const error = mockError({ keyword: 'format', params: { format: 'email' } });
			expect(formatProblem(error)).to.equal('needs to be formatted as `email`');
		});

		it('should format format keyword with uri', () => {
			const error = mockError({ keyword: 'format', params: { format: 'uri' } });
			expect(formatProblem(error)).to.equal('needs to be formatted as `uri`');
		});

		it('should format format keyword with date', () => {
			const error = mockError({ keyword: 'format', params: { format: 'date' } });
			expect(formatProblem(error)).to.equal('needs to be formatted as `date`');
		});

		it('should format format keyword with uuid', () => {
			const error = mockError({ keyword: 'format', params: { format: 'uuid' } });
			expect(formatProblem(error)).to.equal('needs to be formatted as `uuid`');
		});

		describe('type keyword', () => {
			it('should use "a" for string', () => {
				const error = mockError({ keyword: 'type', params: { type: 'string' } });
				expect(formatProblem(error)).to.equal('needs to be a `string`');
			});

			it('should use "a" for number', () => {
				const error = mockError({ keyword: 'type', params: { type: 'number' } });
				expect(formatProblem(error)).to.equal('needs to be a `number`');
			});

			it('should use "an" for integer', () => {
				const error = mockError({ keyword: 'type', params: { type: 'integer' } });
				expect(formatProblem(error)).to.equal('needs to be an `integer`');
			});

			it('should use "a" for boolean', () => {
				const error = mockError({ keyword: 'type', params: { type: 'boolean' } });
				expect(formatProblem(error)).to.equal('needs to be a `boolean`');
			});

			it('should use "an" for array', () => {
				const error = mockError({ keyword: 'type', params: { type: 'array' } });
				expect(formatProblem(error)).to.equal('needs to be an `array`');
			});

			it('should use "an" for object', () => {
				const error = mockError({ keyword: 'type', params: { type: 'object' } });
				expect(formatProblem(error)).to.equal('needs to be an `object`');
			});

			it('should format union type string,null', () => {
				const error = mockError({ keyword: 'type', params: { type: 'string,null' } });
				expect(formatProblem(error)).to.equal('needs to be a `string` or `null`');
			});

			it('should format union type number,null', () => {
				const error = mockError({ keyword: 'type', params: { type: 'number,null' } });
				expect(formatProblem(error)).to.equal('needs to be a `number` or `null`');
			});

			it('should format union type array,null', () => {
				const error = mockError({ keyword: 'type', params: { type: 'array,null' } });
				expect(formatProblem(error)).to.equal('needs to be an `array` or `null`');
			});

			it('should format union type string,number with articles for both', () => {
				const error = mockError({ keyword: 'type', params: { type: 'string,number' } });
				expect(formatProblem(error)).to.equal('needs to be a `string` or a `number`');
			});
		});

		describe('enum keyword', () => {
			it('should format multiple enum values', () => {
				const error = mockError({ keyword: 'enum', params: { allowedValues: ['active', 'inactive', 'pending'] } });
				expect(formatProblem(error)).to.equal('needs to be one of "active", "inactive", "pending"');
			});

			it('should format single enum value without "one of"', () => {
				const error = mockError({ keyword: 'enum', params: { allowedValues: ['fixed'] } });
				expect(formatProblem(error)).to.equal('needs to be "fixed"');
			});

			it('should format two enum values', () => {
				const error = mockError({ keyword: 'enum', params: { allowedValues: ['yes', 'no'] } });
				expect(formatProblem(error)).to.equal('needs to be one of "yes", "no"');
			});

			it('should handle boolean enum values', () => {
				const error = mockError({ keyword: 'enum', params: { allowedValues: [true] } });
				expect(formatProblem(error)).to.equal('needs to be "true"');
			});

			it('should handle numeric enum values', () => {
				const error = mockError({ keyword: 'enum', params: { allowedValues: [1, 2, 3] } });
				expect(formatProblem(error)).to.equal('needs to be one of "1", "2", "3"');
			});
		});
	});

	describe('new keywords', () => {
		it('should format minimum', () => {
			const error = mockError({ keyword: 'minimum', params: { limit: 0, comparison: '>=' } });
			expect(formatProblem(error)).to.equal('needs to be at least 0');
		});

		it('should format maximum', () => {
			const error = mockError({ keyword: 'maximum', params: { limit: 100, comparison: '<=' } });
			expect(formatProblem(error)).to.equal('needs to be at most 100');
		});

		it('should format exclusiveMinimum', () => {
			const error = mockError({ keyword: 'exclusiveMinimum', params: { limit: 0, comparison: '>' } });
			expect(formatProblem(error)).to.equal('needs to be greater than 0');
		});

		it('should format exclusiveMaximum', () => {
			const error = mockError({ keyword: 'exclusiveMaximum', params: { limit: 100, comparison: '<' } });
			expect(formatProblem(error)).to.equal('needs to be less than 100');
		});

		it('should format multipleOf', () => {
			const error = mockError({ keyword: 'multipleOf', params: { multipleOf: 5 } });
			expect(formatProblem(error)).to.equal('needs to be a multiple of 5');
		});

		it('should format minLength singular', () => {
			const error = mockError({ keyword: 'minLength', params: { limit: 1 } });
			expect(formatProblem(error)).to.equal('needs to have at least 1 character');
		});

		it('should format minLength plural', () => {
			const error = mockError({ keyword: 'minLength', params: { limit: 3 } });
			expect(formatProblem(error)).to.equal('needs to have at least 3 characters');
		});

		it('should format maxLength', () => {
			const error = mockError({ keyword: 'maxLength', params: { limit: 255 } });
			expect(formatProblem(error)).to.equal('needs to have at most 255 characters');
		});

		it('should format pattern', () => {
			const error = mockError({ keyword: 'pattern', params: { pattern: '^[a-z]+$' } });
			expect(formatProblem(error)).to.equal('is not in the expected format');
		});

		it('should format minItems singular', () => {
			const error = mockError({ keyword: 'minItems', params: { limit: 1 } });
			expect(formatProblem(error)).to.equal('needs to have at least 1 item');
		});

		it('should format minItems plural', () => {
			const error = mockError({ keyword: 'minItems', params: { limit: 3 } });
			expect(formatProblem(error)).to.equal('needs to have at least 3 items');
		});

		it('should format maxItems', () => {
			const error = mockError({ keyword: 'maxItems', params: { limit: 10 } });
			expect(formatProblem(error)).to.equal('needs to have at most 10 items');
		});

		it('should format uniqueItems', () => {
			const error = mockError({ keyword: 'uniqueItems', params: { i: 2, j: 0 } });
			expect(formatProblem(error)).to.equal('must not have duplicate items');
		});

		it('should format const with string value', () => {
			const error = mockError({ keyword: 'const', params: { allowedValue: 'webhook' } });
			expect(formatProblem(error)).to.equal('needs to be "webhook"');
		});

		it('should format const with numeric value', () => {
			const error = mockError({ keyword: 'const', params: { allowedValue: 42 } });
			expect(formatProblem(error)).to.equal('needs to be 42');
		});

		it('should format const with boolean value', () => {
			const error = mockError({ keyword: 'const', params: { allowedValue: true } });
			expect(formatProblem(error)).to.equal('needs to be true');
		});

		it('should format const with null value', () => {
			const error = mockError({ keyword: 'const', params: { allowedValue: null } });
			expect(formatProblem(error)).to.equal('needs to be null');
		});

		it('should format not', () => {
			const error = mockError({ keyword: 'not', params: {} });
			expect(formatProblem(error)).to.equal('must not match the excluded schema');
		});

		it('should format oneOf', () => {
			const error = mockError({ keyword: 'oneOf', params: { passingSchemas: null } });
			expect(formatProblem(error)).to.equal('must match exactly one of the allowed schemas');
		});

		it('should format anyOf', () => {
			const error = mockError({ keyword: 'anyOf', params: {} });
			expect(formatProblem(error)).to.equal('must match at least one of the allowed schemas');
		});

		it('should format if', () => {
			const error = mockError({ keyword: 'if', params: { failingKeyword: 'then' } });
			expect(formatProblem(error)).to.equal('does not satisfy the conditional requirement');
		});

		it('should format contains singular', () => {
			// Note: the implementation reads `params.min`, not `params.minContains`
			const error = mockError({ keyword: 'contains', params: { min: 1 } });
			expect(formatProblem(error)).to.equal('must contain at least 1 matching item');
		});

		it('should format contains plural', () => {
			// Note: the implementation reads `params.min`, not `params.minContains`
			const error = mockError({ keyword: 'contains', params: { min: 3 } });
			expect(formatProblem(error)).to.equal('must contain at least 3 matching items');
		});

		it('should format propertyNames', () => {
			const error = mockError({ keyword: 'propertyNames', params: { propertyName: 'bad!' } });
			expect(formatProblem(error)).to.equal('has an invalid property name: "bad!"');
		});

		it('should format additionalItems', () => {
			const error = mockError({ keyword: 'additionalItems', params: { limit: 3 } });
			expect(formatProblem(error)).to.equal('must not have more than 3 items');
		});

		it('should format dependencies', () => {
			const error = mockError({ keyword: 'dependencies', params: { property: 'a', deps: 'b, c', depsCount: 2 } });
			expect(formatProblem(error)).to.equal('has "a" which requires "b, c"');
		});

		it('should format maxProperties', () => {
			const error = mockError({ keyword: 'maxProperties', params: { limit: 5 } });
			expect(formatProblem(error)).to.equal('must not have more than 5 properties');
		});

		it('should format minProperties singular', () => {
			const error = mockError({ keyword: 'minProperties', params: { limit: 1 } });
			expect(formatProblem(error)).to.equal('must have at least 1 property');
		});

		it('should format minProperties plural', () => {
			const error = mockError({ keyword: 'minProperties', params: { limit: 3 } });
			expect(formatProblem(error)).to.equal('must have at least 3 properties');
		});

		it('should format discriminator mapping error', () => {
			const error = mockError({
				keyword: 'discriminator',
				params: { error: 'mapping', tag: 'type', tagValue: 'unknown' },
			});
			expect(formatProblem(error)).to.equal('has an unrecognized "type" value: "unknown"');
		});

		it('should format discriminator tag error', () => {
			const error = mockError({
				keyword: 'discriminator',
				params: { error: 'tag', tag: 'type', tagValue: 123 },
			});
			expect(formatProblem(error)).to.equal('has a "type" that is not a string');
		});

		it('should format false schema', () => {
			const error = mockError({ keyword: 'false schema', params: {} });
			expect(formatProblem(error)).to.equal('is not allowed');
		});

		it('should format unknown keyword as fallback', () => {
			const error = mockError({ keyword: 'unknownKeyword', params: {} });
			expect(formatProblem(error)).to.equal('is invalid');
		});
	});
});

describe('normalizeErrors', () => {
	describe('oneOf/anyOf child error filtering', () => {
		it('should filter out child errors when oneOf parent error exists', () => {
			const errors = [
				mockError({ keyword: 'const', instancePath: '/type', schemaPath: '#/oneOf/0/properties/type/const', params: { allowedValue: 'a' } }),
				mockError({ keyword: 'const', instancePath: '/type', schemaPath: '#/oneOf/1/properties/type/const', params: { allowedValue: 'b' } }),
				mockError({ keyword: 'oneOf', instancePath: '', schemaPath: '#/oneOf', params: { passingSchemas: null } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(1);
			expect(result[0]!.field).to.equal('value');
			expect(result[0]!.problem).to.equal('must match exactly one of the allowed schemas');
		});

		it('should filter out child errors when anyOf parent error exists', () => {
			const errors = [
				mockError({ keyword: 'type', instancePath: '', schemaPath: '#/anyOf/0/type', params: { type: 'string' } }),
				mockError({ keyword: 'type', instancePath: '', schemaPath: '#/anyOf/1/type', params: { type: 'number' } }),
				mockError({ keyword: 'anyOf', instancePath: '', schemaPath: '#/anyOf', params: {} }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(1);
			expect(result[0]!.problem).to.equal('must match at least one of the allowed schemas');
		});

		it('should keep child errors when discriminator is present', () => {
			const errors = [
				mockError({ keyword: 'discriminator', instancePath: '', schemaPath: '#/discriminator', params: { error: 'mapping', tag: 'type', tagValue: 'x' } }),
				mockError({ keyword: 'oneOf', instancePath: '', schemaPath: '#/oneOf', params: { passingSchemas: null } }),
			];
			const result = normalizeErrors(errors);
			// discriminator error should be kept
			const hasDiscriminator = result.some((r) => r.problem.includes('unrecognized'));
			expect(hasDiscriminator).to.equal(true);
		});

		it('should keep non-oneOf/anyOf errors even when filtering', () => {
			const errors = [
				mockError({ keyword: 'required', instancePath: '', schemaPath: '#/required', params: { missingProperty: 'name' } }),
				mockError({ keyword: 'const', instancePath: '/type', schemaPath: '#/oneOf/0/properties/type/const', params: { allowedValue: 'a' } }),
				mockError({ keyword: 'oneOf', instancePath: '', schemaPath: '#/oneOf', params: { passingSchemas: null } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(2);
			expect(result[0]!.field).to.equal('name');
			expect(result[0]!.problem).to.equal('is missing');
		});
	});

	describe('if/then/else filtering', () => {
		it('should filter out generic if error when then/else errors exist', () => {
			const errors = [
				mockError({ keyword: 'if', instancePath: '', schemaPath: '#/if', params: { failingKeyword: 'then' } }),
				mockError({ keyword: 'required', instancePath: '', schemaPath: '#/then/required', params: { missingProperty: 'company' } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(1);
			expect(result[0]!.field).to.equal('company');
			expect(result[0]!.problem).to.equal('is missing');
		});

		it('should keep if error when no then/else errors exist', () => {
			const errors = [
				mockError({ keyword: 'if', instancePath: '', schemaPath: '#/if', params: { failingKeyword: 'then' } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(1);
			expect(result[0]!.problem).to.equal('does not satisfy the conditional requirement');
		});
	});

	describe('deduplication', () => {
		it('should deduplicate errors with same field and problem', () => {
			const errors = [
				mockError({ keyword: 'type', instancePath: '/name', schemaPath: '#/oneOf/0/properties/name/type', params: { type: 'string' } }),
				mockError({ keyword: 'type', instancePath: '/name', schemaPath: '#/oneOf/1/properties/name/type', params: { type: 'string' } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(1);
		});

		it('should keep errors with same field but different problems', () => {
			const errors = [
				mockError({ keyword: 'type', instancePath: '/name', params: { type: 'string' } }),
				mockError({ keyword: 'minLength', instancePath: '/name', params: { limit: 1 } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(2);
		});

		it('should keep errors with same problem but different fields', () => {
			const errors = [
				mockError({ keyword: 'required', instancePath: '', params: { missingProperty: 'email' } }),
				mockError({ keyword: 'required', instancePath: '', params: { missingProperty: 'name' } }),
			];
			const result = normalizeErrors(errors);
			expect(result).to.have.length(2);
		});
	});
});

describe('formatMessage', () => {
	it('should format a single error', () => {
		const result = formatMessage([{ field: 'email', problem: 'is missing' }]);
		expect(result).to.equal('`email` is missing.');
	});

	it('should format two errors separated by space', () => {
		const result = formatMessage([
			{ field: 'email', problem: 'is missing' },
			{ field: 'extra', problem: 'is not allowed' },
		]);
		expect(result).to.equal('`email` is missing. `extra` is not allowed.');
	});

	it('should format three errors', () => {
		const result = formatMessage([
			{ field: 'a', problem: 'is missing' },
			{ field: 'b', problem: 'is missing' },
			{ field: 'c', problem: 'is missing' },
		]);
		expect(result).to.equal('`a` is missing. `b` is missing. `c` is missing.');
	});

	it('should handle field names with dots', () => {
		const result = formatMessage([{ field: 'event.type', problem: 'is missing' }]);
		expect(result).to.equal('`event.type` is missing.');
	});

	it('should handle field names with brackets', () => {
		const result = formatMessage([{ field: 'users[0].email', problem: 'is missing' }]);
		expect(result).to.equal('`users[0].email` is missing.');
	});

	it('should handle backtick-containing problem text', () => {
		const result = formatMessage([{ field: 'name', problem: 'needs to be a `string`' }]);
		expect(result).to.equal('`name` needs to be a `string`.');
	});
});
