import { expect } from 'chai';
import { Check } from './Check';
import { CheckError } from './CheckError';
import { Schema } from './index';

describe('Check class', () => {
	// Schema for testing
	const schema: Schema = {
		type: 'object',
		properties: {
			name: { type: 'string' },
			email: { type: 'string', format: 'email' },
			favourite_films: { type: 'array', items: { type: 'string' } },
			website: { type: 'string', format: 'uri' },
			status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
			primary: { type: 'boolean', enum: [true] },
		},
		required: ['name', 'email', 'favourite_films'],
	};

	// @ts-expect-error, allow undefined schema for testing runtime checks..
	const check = (schema?: Schema) => new Check(schema);

	const name = 'Nicolas Cage';
	const email = 'nic@cage.com';
	const favourite_films = ['Face/Off', 'Bad Lieutenant', 'The Wicker Man'];
	const website = 'https://freeman.sh';

	describe('constructor', () => {
		it('should throw an error if no schema is provided', () => {
			expect(() => check()).to.throw(CheckError, 'Schema must be defined in constructor.');
		});

		it('should create a Check instance with a valid schema', () => {
			const instance = check(schema);
			expect(instance).to.be.instanceOf(Check);
		});
	});

	describe('test method', () => {
		it('should throw an error if object is null or undefined', () => {
			expect(() => check(schema).test(null)).to.throw(CheckError, 'The first argument is null or undefined.');
			expect(() => check(schema).test(undefined)).to.throw(CheckError, 'The first argument is null or undefined.');
		});

		it('should not throw an error if object is valid', () => {
			const object = {
				name,
				email,
				favourite_films,
			};
			expect(() => check(schema).test(object)).to.not.throw();
		});

		it('should throw an error if object is missing required fields', () => {
			const object = {
				name,
				favourite_films,
			};
			expect(() => check(schema).test(object)).to.throw(CheckError, '`email` is missing.');
		});

		describe('Format check', () => {
			it('should throw an error if object has malformatted email', () => {
				const object = {
					name,
					email: 'invalid-email',
					favourite_films,
					website,
				};
				expect(() => check(schema).test(object)).to.throw(CheckError, '`email` needs to be formatted as `email`.');
			});

			it('should throw an error if object has malformatted uri', () => {
				const object = {
					name,
					email,
					favourite_films,
					website: 'invalid-website',
				};
				expect(() => check(schema).test(object)).to.throw(CheckError, '`website` needs to be formatted as `uri`.');
			});
		});

		it('should throw an error if object has additional properties', () => {
			const object = {
				name,
				email,
				favourite_films,
				extra_field: 'extra',
			};
			expect(() => check({ ...schema, additionalProperties: false }).test(object)).to.throw(CheckError, '`extra_field` is not allowed.');
		});

		it('should throw an error if object has incorrect type', () => {
			const object = {
				name,
				email,
				favourite_films: 'Transformers', // This should be an array
			};
			expect(() => check(schema).test(object)).to.throw(CheckError, '`favourite_films` needs to be an `array`.');
		});

		describe('Enum check', () => {
			it('should throw an error if object has incorrect enum value', () => {
				const object = {
					name,
					email,
					favourite_films,
					status: 'unknown', // Incorrect enum value
				};
				expect(() => check(schema).test(object)).to.throw(CheckError, '`status` needs to be one of "active", "inactive", "pending".');
			});

			it('should show a slightly different message when it is a single value', () => {
				const object = {
					name,
					email,
					favourite_films,
					primary: false, // Incorrect enum value
				};
				expect(() => check(schema).test(object)).to.throw(CheckError, '`primary` needs to be "true".');
			});
		});

		describe('Multiple errors', () => {
			it('should be able to return multiple errors joined together', () => {
				const object = {
					name,
					email: 'invalid-email',
					favourite_films: 'Transformers', // This should be an array
					website: 'invalid-website',
					status: 'unknown', // Incorrect enum value
				};
				expect(() => check(schema).test(object)).to.throw(
					CheckError,
					'`email` needs to be formatted as `email`. `favourite_films` needs to be an `array`. `website` needs to be formatted as `uri`. `status` needs to be one of "active", "inactive", "pending".'
				);
			});
		});
	});
});

describe('backwards compatibility', () => {

	describe('required — `field` is missing', () => {
		it('should produce `email` is missing for a missing required field', () => {
			const check = new Check({
				type: 'object',
				properties: { email: { type: 'string' } },
				required: ['email'],
			});
			expect(() => check.test({})).to.throw(CheckError, '`email` is missing.');
		});

		it('should produce `name` is missing for another missing field', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			});
			expect(() => check.test({})).to.throw(CheckError, '`name` is missing.');
		});

		it('should handle nested required fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					event: {
						type: 'object',
						properties: { type: { type: 'string' } },
						required: ['type'],
					},
				},
				required: ['event'],
			});
			expect(() => check.test({ event: {} })).to.throw(CheckError, '`event.type` is missing.');
		});

		it('should handle deeply nested required fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					event: {
						type: 'object',
						properties: {
							metadata: {
								type: 'object',
								properties: { path: { type: 'string' } },
								required: ['path'],
							},
						},
						required: ['metadata'],
					},
				},
				required: ['event'],
			});
			expect(() => check.test({ event: { metadata: {} } })).to.throw(CheckError, '`event.metadata.path` is missing.');
		});

		it('should handle required in array items', () => {
			const check = new Check({
				type: 'object',
				properties: {
					users: {
						type: 'array',
						items: {
							type: 'object',
							properties: { email: { type: 'string' } },
							required: ['email'],
						},
					},
				},
				required: ['users'],
			});
			expect(() => check.test({ users: [{}] })).to.throw(CheckError, '`users[0].email` is missing.');
		});

		it('should handle multiple missing required fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					first_name: { type: 'string' },
					last_name: { type: 'string' },
				},
				required: ['first_name', 'last_name'],
			});
			expect(() => check.test({})).to.throw(CheckError, '`first_name` is missing. `last_name` is missing.');
		});
	});

	describe('additionalProperties — `field` is not allowed', () => {
		it('should produce `extra_field` is not allowed', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
				additionalProperties: false,
			});
			expect(() => check.test({ name: 'test', extra_field: 'bad' })).to.throw(CheckError, '`extra_field` is not allowed.');
		});

		it('should handle multiple additional properties', () => {
			const check = new Check({
				type: 'object',
				properties: {},
				additionalProperties: false,
			});
			expect(() => check.test({ a: 1, b: 2 })).to.throw(CheckError);
			// Both `a` and `b` should appear as "is not allowed"
		});

		it('should handle nested additional properties', () => {
			const check = new Check({
				type: 'object',
				properties: {
					event: {
						type: 'object',
						properties: { type: { type: 'string' } },
						additionalProperties: false,
					},
				},
			});
			expect(() => check.test({ event: { type: 'test', extra: 'bad' } })).to.throw(CheckError, '`event.extra` is not allowed.');
		});
	});

	describe('type — `field` needs to be a/an `type`', () => {
		it('should use "a" for string', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
			});
			expect(() => check.test({ name: 123 })).to.throw(CheckError, '`name` needs to be a `string`.');
		});

		it('should use "a" for number', () => {
			const check = new Check({
				type: 'object',
				properties: { count: { type: 'number' } },
			});
			expect(() => check.test({ count: 'text' })).to.throw(CheckError, '`count` needs to be a `number`.');
		});

		it('should use "an" for integer', () => {
			const check = new Check({
				type: 'object',
				properties: { count: { type: 'integer' } },
			});
			expect(() => check.test({ count: 'text' })).to.throw(CheckError, '`count` needs to be an `integer`.');
		});

		it('should use "a" for boolean', () => {
			const check = new Check({
				type: 'object',
				properties: { enabled: { type: 'boolean' } },
			});
			expect(() => check.test({ enabled: 'yes' })).to.throw(CheckError, '`enabled` needs to be a `boolean`.');
		});

		it('should use "an" for array', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array' } },
			});
			expect(() => check.test({ tags: 'not-array' })).to.throw(CheckError, '`tags` needs to be an `array`.');
		});

		it('should use "an" for object', () => {
			const check = new Check({
				type: 'object',
				properties: { data: { type: 'object' } },
			});
			expect(() => check.test({ data: 'not-object' })).to.throw(CheckError, '`data` needs to be an `object`.');
		});

		it('should handle nested type errors', () => {
			const check = new Check({
				type: 'object',
				properties: {
					event: {
						type: 'object',
						properties: { count: { type: 'number' } },
					},
				},
			});
			expect(() => check.test({ event: { count: 'text' } })).to.throw(CheckError, '`event.count` needs to be a `number`.');
		});

		it('should handle type errors in array items', () => {
			const check = new Check({
				type: 'object',
				properties: {
					scores: {
						type: 'array',
						items: { type: 'number' },
					},
				},
			});
			expect(() => check.test({ scores: [1, 'bad', 3] })).to.throw(CheckError, '`scores[1]` needs to be a `number`.');
		});

		it('should handle root-level type error', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test('not an object')).to.throw(CheckError, '`value` needs to be an `object`.');
		});
	});

	describe('enum — `field` needs to be [one of] "values"', () => {
		it('should format multiple enum values', () => {
			const check = new Check({
				type: 'object',
				properties: { status: { type: 'string', enum: ['active', 'inactive', 'pending'] } },
			});
			expect(() => check.test({ status: 'deleted' })).to.throw(CheckError, '`status` needs to be one of "active", "inactive", "pending".');
		});

		it('should format single enum value without "one of"', () => {
			const check = new Check({
				type: 'object',
				properties: { primary: { type: 'boolean', enum: [true] } },
			});
			expect(() => check.test({ primary: false })).to.throw(CheckError, '`primary` needs to be "true".');
		});

		it('should format two enum values', () => {
			const check = new Check({
				type: 'object',
				properties: { toggle: { type: 'string', enum: ['on', 'off'] } },
			});
			expect(() => check.test({ toggle: 'maybe' })).to.throw(CheckError, '`toggle` needs to be one of "on", "off".');
		});

		it('should handle nested enum errors', () => {
			const check = new Check({
				type: 'object',
				properties: {
					rating: {
						type: 'object',
						properties: { outcome: { type: 'string', enum: ['GOOD', 'BAD'] } },
					},
				},
			});
			expect(() => check.test({ rating: { outcome: 'MEH' } })).to.throw(CheckError, '`rating.outcome` needs to be one of "GOOD", "BAD".');
		});
	});

	describe('format — `field` needs to be formatted as `format`', () => {
		it('should handle email format', () => {
			const check = new Check({
				type: 'object',
				properties: { email: { type: 'string', format: 'email' } },
			});
			expect(() => check.test({ email: 'not-email' })).to.throw(CheckError, '`email` needs to be formatted as `email`.');
		});

		it('should handle uri format', () => {
			const check = new Check({
				type: 'object',
				properties: { website: { type: 'string', format: 'uri' } },
			});
			expect(() => check.test({ website: 'not-uri' })).to.throw(CheckError, '`website` needs to be formatted as `uri`.');
		});

		it('should handle date format', () => {
			const check = new Check({
				type: 'object',
				properties: { date: { type: 'string', format: 'date' } },
			});
			expect(() => check.test({ date: 'not-a-date' })).to.throw(CheckError, '`date` needs to be formatted as `date`.');
		});

		it('should handle uuid format', () => {
			const check = new Check({
				type: 'object',
				properties: { id: { type: 'string', format: 'uuid' } },
			});
			expect(() => check.test({ id: 'not-uuid' })).to.throw(CheckError, '`id` needs to be formatted as `uuid`.');
		});

		it('should handle format in nested fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					contact: {
						type: 'object',
						properties: { email: { type: 'string', format: 'email' } },
					},
				},
			});
			expect(() => check.test({ contact: { email: 'bad' } })).to.throw(CheckError, '`contact.email` needs to be formatted as `email`.');
		});

		it('should handle format in array items', () => {
			const check = new Check({
				type: 'object',
				properties: {
					users: {
						type: 'array',
						items: {
							type: 'object',
							properties: { email: { type: 'string', format: 'email' } },
						},
					},
				},
			});
			expect(() => check.test({ users: [{ email: 'bad' }] })).to.throw(CheckError, '`users[0].email` needs to be formatted as `email`.');
		});
	});

	describe('multi-error concatenation', () => {
		it('should join required + additionalProperties errors', () => {
			const check = new Check({
				type: 'object',
				properties: { email: { type: 'string' } },
				required: ['email'],
				additionalProperties: false,
			});
			expect(() => check.test({ wrong: 'bad' })).to.throw(CheckError);
			// Should contain both `email` is missing and `wrong` is not allowed
		});

		it('should handle three or more errors', () => {
			const check = new Check({
				type: 'object',
				properties: {
					address: { type: 'string' },
					postcode: { type: 'string' },
					country: { type: 'string' },
				},
				required: ['address', 'postcode', 'country'],
			});
			expect(() => check.test({})).to.throw(CheckError, '`address` is missing. `postcode` is missing. `country` is missing.');
		});

		it('should handle mixed keyword types in one message', () => {
			const check = new Check({
				type: 'object',
				properties: {
					email: { type: 'string', format: 'email' },
					tags: { type: 'array' },
					status: { type: 'string', enum: ['active', 'inactive'] },
				},
			});
			expect(() => check.test({ email: 'bad', tags: 'not-array', status: 'unknown' })).to.throw(CheckError, '`email` needs to be formatted as `email`. `tags` needs to be an `array`. `status` needs to be one of "active", "inactive".');
		});
	});

	describe('edge cases', () => {
		it('should throw for null input', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test(null)).to.throw(CheckError, 'The first argument is null or undefined.');
		});

		it('should throw for undefined input', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test(undefined)).to.throw(CheckError, 'The first argument is null or undefined.');
		});

		it('should throw for no schema', () => {
			expect(() => new Check(null as any)).to.throw(CheckError, 'Schema must be defined in constructor.');
		});

		it('should not throw for valid input', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			});
			expect(() => check.test({ name: 'valid' })).to.not.throw();
		});
	});
});
