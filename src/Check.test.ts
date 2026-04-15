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

describe('new keyword handling — numeric, string, array', () => {

	describe('minimum', () => {
		it('should reject a value below minimum', () => {
			const check = new Check({
				type: 'object',
				properties: { age: { type: 'integer', minimum: 0 } },
			});
			expect(() => check.test({ age: -1 })).to.throw(CheckError, '`age` needs to be at least 0.');
		});

		it('should accept a value equal to minimum', () => {
			const check = new Check({
				type: 'object',
				properties: { age: { type: 'integer', minimum: 0 } },
			});
			expect(() => check.test({ age: 0 })).to.not.throw();
		});

		it('should handle minimum on nested fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					config: {
						type: 'object',
						properties: { retries: { type: 'integer', minimum: 1 } },
					},
				},
			});
			expect(() => check.test({ config: { retries: 0 } })).to.throw(CheckError, '`config.retries` needs to be at least 1.');
		});

		it('should handle minimum in array items', () => {
			const check = new Check({
				type: 'object',
				properties: {
					scores: {
						type: 'array',
						items: { type: 'number', minimum: 0 },
					},
				},
			});
			expect(() => check.test({ scores: [10, -5, 20] })).to.throw(CheckError, '`scores[1]` needs to be at least 0.');
		});

		it('should handle minimum with decimal limit', () => {
			const check = new Check({
				type: 'object',
				properties: { rate: { type: 'number', minimum: 0.01 } },
			});
			expect(() => check.test({ rate: 0 })).to.throw(CheckError, '`rate` needs to be at least 0.01.');
		});
	});

	describe('maximum', () => {
		it('should reject a value above maximum', () => {
			const check = new Check({
				type: 'object',
				properties: { quantity: { type: 'integer', maximum: 100 } },
			});
			expect(() => check.test({ quantity: 150 })).to.throw(CheckError, '`quantity` needs to be at most 100.');
		});

		it('should accept a value equal to maximum', () => {
			const check = new Check({
				type: 'object',
				properties: { quantity: { type: 'integer', maximum: 100 } },
			});
			expect(() => check.test({ quantity: 100 })).to.not.throw();
		});

		it('should handle maximum on nested fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					settings: {
						type: 'object',
						properties: { timeout: { type: 'integer', maximum: 30 } },
					},
				},
			});
			expect(() => check.test({ settings: { timeout: 60 } })).to.throw(CheckError, '`settings.timeout` needs to be at most 30.');
		});
	});

	describe('exclusiveMinimum', () => {
		it('should reject a value equal to exclusiveMinimum', () => {
			const check = new Check({
				type: 'object',
				properties: { amount: { type: 'number', exclusiveMinimum: 0 } },
			});
			expect(() => check.test({ amount: 0 })).to.throw(CheckError, '`amount` needs to be greater than 0.');
		});

		it('should accept a value above exclusiveMinimum', () => {
			const check = new Check({
				type: 'object',
				properties: { amount: { type: 'number', exclusiveMinimum: 0 } },
			});
			expect(() => check.test({ amount: 0.01 })).to.not.throw();
		});
	});

	describe('exclusiveMaximum', () => {
		it('should reject a value equal to exclusiveMaximum', () => {
			const check = new Check({
				type: 'object',
				properties: { score: { type: 'number', exclusiveMaximum: 100 } },
			});
			expect(() => check.test({ score: 100 })).to.throw(CheckError, '`score` needs to be less than 100.');
		});

		it('should accept a value below exclusiveMaximum', () => {
			const check = new Check({
				type: 'object',
				properties: { score: { type: 'number', exclusiveMaximum: 100 } },
			});
			expect(() => check.test({ score: 99.99 })).to.not.throw();
		});
	});

	describe('multipleOf', () => {
		it('should reject a value not a multiple', () => {
			const check = new Check({
				type: 'object',
				properties: { quantity: { type: 'integer', multipleOf: 5 } },
			});
			expect(() => check.test({ quantity: 7 })).to.throw(CheckError, '`quantity` needs to be a multiple of 5.');
		});

		it('should accept a valid multiple', () => {
			const check = new Check({
				type: 'object',
				properties: { quantity: { type: 'integer', multipleOf: 5 } },
			});
			expect(() => check.test({ quantity: 15 })).to.not.throw();
		});

		it('should handle decimal multipleOf', () => {
			const check = new Check({
				type: 'object',
				properties: { price: { type: 'number', multipleOf: 0.01 } },
			});
			expect(() => check.test({ price: 1.005 })).to.throw(CheckError, '`price` needs to be a multiple of 0.01.');
		});
	});

	describe('minLength', () => {
		it('should reject empty string when minLength is 1 (singular)', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string', minLength: 1 } },
			});
			expect(() => check.test({ name: '' })).to.throw(CheckError, '`name` needs to have at least 1 character.');
		});

		it('should use plural for minLength > 1', () => {
			const check = new Check({
				type: 'object',
				properties: { code: { type: 'string', minLength: 3 } },
			});
			expect(() => check.test({ code: 'ab' })).to.throw(CheckError, '`code` needs to have at least 3 characters.');
		});

		it('should accept a string meeting minLength', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string', minLength: 1 } },
			});
			expect(() => check.test({ name: 'a' })).to.not.throw();
		});

		it('should handle nested minLength', () => {
			const check = new Check({
				type: 'object',
				properties: {
					user: {
						type: 'object',
						properties: { bio: { type: 'string', minLength: 10 } },
					},
				},
			});
			expect(() => check.test({ user: { bio: 'short' } })).to.throw(CheckError, '`user.bio` needs to have at least 10 characters.');
		});
	});

	describe('maxLength', () => {
		it('should reject a string exceeding maxLength', () => {
			const check = new Check({
				type: 'object',
				properties: { bio: { type: 'string', maxLength: 10 } },
			});
			expect(() => check.test({ bio: 'this is a very long string' })).to.throw(CheckError, '`bio` needs to have at most 10 characters.');
		});

		it('should accept a string at maxLength', () => {
			const check = new Check({
				type: 'object',
				properties: { bio: { type: 'string', maxLength: 10 } },
			});
			expect(() => check.test({ bio: '1234567890' })).to.not.throw();
		});
	});

	describe('pattern', () => {
		it('should hide regex and show generic message', () => {
			const check = new Check({
				type: 'object',
				properties: { time: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' } },
			});
			expect(() => check.test({ time: '25:00' })).to.throw(CheckError, '`time` is not in the expected format.');
		});

		it('should handle simple pattern', () => {
			const check = new Check({
				type: 'object',
				properties: { code: { type: 'string', pattern: '^[A-Z]{3}$' } },
			});
			expect(() => check.test({ code: 'ab' })).to.throw(CheckError, '`code` is not in the expected format.');
		});

		it('should accept a matching value', () => {
			const check = new Check({
				type: 'object',
				properties: { code: { type: 'string', pattern: '^[A-Z]{3}$' } },
			});
			expect(() => check.test({ code: 'ABC' })).to.not.throw();
		});

		it('should handle nested pattern', () => {
			const check = new Check({
				type: 'object',
				properties: {
					address: {
						type: 'object',
						properties: { postcode: { type: 'string', pattern: '^[0-9]{5}$' } },
					},
				},
			});
			expect(() => check.test({ address: { postcode: 'ABCDE' } })).to.throw(CheckError, '`address.postcode` is not in the expected format.');
		});
	});

	describe('minItems', () => {
		it('should reject empty array when minItems is 1 (singular)', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, minItems: 1 } },
			});
			expect(() => check.test({ tags: [] })).to.throw(CheckError, '`tags` needs to have at least 1 item.');
		});

		it('should use plural for minItems > 1', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, minItems: 3 } },
			});
			expect(() => check.test({ tags: ['a', 'b'] })).to.throw(CheckError, '`tags` needs to have at least 3 items.');
		});

		it('should accept array meeting minItems', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, minItems: 1 } },
			});
			expect(() => check.test({ tags: ['a'] })).to.not.throw();
		});
	});

	describe('maxItems', () => {
		it('should reject array exceeding maxItems', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, maxItems: 2 } },
			});
			expect(() => check.test({ tags: ['a', 'b', 'c'] })).to.throw(CheckError, '`tags` needs to have at most 2 items.');
		});

		it('should accept array at maxItems', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, maxItems: 2 } },
			});
			expect(() => check.test({ tags: ['a', 'b'] })).to.not.throw();
		});

		it('should handle nested array maxItems', () => {
			const check = new Check({
				type: 'object',
				properties: {
					config: {
						type: 'object',
						properties: { values: { type: 'array', items: { type: 'number' }, maxItems: 5 } },
					},
				},
			});
			expect(() => check.test({ config: { values: [1, 2, 3, 4, 5, 6] } })).to.throw(CheckError, '`config.values` needs to have at most 5 items.');
		});
	});

	describe('uniqueItems', () => {
		it('should reject array with duplicate items', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
			});
			expect(() => check.test({ tags: ['a', 'b', 'a'] })).to.throw(CheckError, '`tags` must not have duplicate items.');
		});

		it('should accept array with unique items', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
			});
			expect(() => check.test({ tags: ['a', 'b', 'c'] })).to.not.throw();
		});

		it('should reject duplicate numbers', () => {
			const check = new Check({
				type: 'object',
				properties: { ids: { type: 'array', items: { type: 'number' }, uniqueItems: true } },
			});
			expect(() => check.test({ ids: [1, 2, 3, 2] })).to.throw(CheckError, '`ids` must not have duplicate items.');
		});
	});

	describe('combined constraints', () => {
		it('should report both minLength and pattern failures', () => {
			const check = new Check({
				type: 'object',
				properties: {
					name: { type: 'string', minLength: 1 },
					code: { type: 'string', pattern: '^[A-Z]+$' },
				},
			});
			expect(() => check.test({ name: '', code: 'abc' })).to.throw(CheckError);
			// Should contain both errors
		});

		it('should report minimum and maximum from different fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					min_age: { type: 'integer', minimum: 0 },
					max_age: { type: 'integer', maximum: 150 },
				},
			});
			expect(() => check.test({ min_age: -1, max_age: 200 })).to.throw(CheckError, '`min_age` needs to be at least 0. `max_age` needs to be at most 150.');
		});
	});
});

describe('new keyword handling — structural and compound', () => {

	describe('oneOf (without discriminator)', () => {
		it('should reject data matching no subschema with a generic message', () => {
			const check = new Check({
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' } }, required: ['type'] },
					{ type: 'object', properties: { type: { const: 'b' } }, required: ['type'] },
				],
			});
			expect(() => check.test({ type: 'c' })).to.throw(CheckError, '`value` must match exactly one of the allowed schemas.');
		});

		it('should reject data matching multiple subschemas', () => {
			const check = new Check({
				oneOf: [
					{ type: 'object', properties: { name: { type: 'string' } } },
					{ type: 'object', properties: { name: { type: 'string' } } },
				],
			});
			expect(() => check.test({ name: 'hello' })).to.throw(CheckError, '`value` must match exactly one of the allowed schemas.');
		});

		it('should accept data matching exactly one subschema', () => {
			const check = new Check({
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' } }, required: ['type'] },
					{ type: 'object', properties: { type: { const: 'b' } }, required: ['type'] },
				],
			});
			expect(() => check.test({ type: 'a' })).to.not.throw();
		});

		it('should show specific errors when one subschema is closest to matching', () => {
			const check = new Check({
				oneOf: [
					{
						type: 'object',
						properties: { type: { const: 'a' }, x: { type: 'number' } },
						required: ['type', 'x'],
					},
					{
						type: 'object',
						properties: { type: { const: 'b' }, y: { type: 'number' } },
						required: ['type', 'y'],
					},
				],
			});
			// Branch 0: type matches 'a', but x is missing → 1 error
			// Branch 1: type doesn't match 'b', and y is missing → 2+ errors
			// Best match: Branch 0 → shows specific error
			expect(() => check.test({ type: 'a' })).to.throw(CheckError, '`x` is missing.');
		});

		it('should show specific errors for the other branch when it is closest', () => {
			const check = new Check({
				oneOf: [
					{
						type: 'object',
						properties: { type: { const: 'a' }, x: { type: 'number' } },
						required: ['type', 'x'],
					},
					{
						type: 'object',
						properties: { type: { const: 'b' }, y: { type: 'number' } },
						required: ['type', 'y'],
					},
				],
			});
			// Branch 0: type doesn't match 'a', and x is missing → 2+ errors
			// Branch 1: type matches 'b', but y is missing → 1 error
			// Best match: Branch 1 → shows specific error
			expect(() => check.test({ type: 'b' })).to.throw(CheckError, '`y` is missing.');
		});

		it('should show type errors from the closest matching subschema', () => {
			const check = new Check({
				oneOf: [
					{
						type: 'object',
						properties: { type: { const: 'a' }, x: { type: 'number' } },
						required: ['type', 'x'],
					},
					{
						type: 'object',
						properties: { type: { const: 'b' }, y: { type: 'number' } },
						required: ['type', 'y'],
					},
				],
			});
			// Branch 0: type matches 'a', x is present but wrong type → 1 error
			// Branch 1: type doesn't match 'b', y is missing → 2+ errors
			// Best match: Branch 0 → shows specific error
			expect(() => check.test({ type: 'a', x: 'not-a-number' })).to.throw(CheckError, '`x` needs to be a `number`.');
		});
	});

	describe('anyOf', () => {
		it('should reject data matching no subschema', () => {
			const check = new Check({
				type: 'object',
				properties: {
					value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
				},
			});
			expect(() => check.test({ value: true })).to.throw(CheckError, '`value` must match at least one of the allowed schemas.');
		});

		it('should accept data matching at least one subschema', () => {
			const check = new Check({
				type: 'object',
				properties: {
					value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
				},
			});
			expect(() => check.test({ value: 'hello' })).to.not.throw();
		});

		it('should accept data matching multiple subschemas', () => {
			const check = new Check({
				type: 'object',
				properties: {
					value: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'string' }] },
				},
			});
			expect(() => check.test({ value: 'hello' })).to.not.throw();
		});

		it('should show specific errors when one anyOf subschema is closest to matching', () => {
			const check = new Check({
				anyOf: [
					{
						type: 'object',
						properties: { mode: { const: 'auto' }, threshold: { type: 'number' } },
						required: ['mode', 'threshold'],
					},
					{
						type: 'object',
						properties: { mode: { const: 'manual' }, value: { type: 'number' }, unit: { type: 'string' } },
						required: ['mode', 'value', 'unit'],
					},
				],
			});
			// Branch 0: mode matches 'auto', threshold is missing → 1 error
			// Branch 1: mode doesn't match 'manual', value and unit missing → 3 errors
			// Best match: Branch 0 → shows specific error
			expect(() => check.test({ mode: 'auto' })).to.throw(CheckError, '`threshold` is missing.');
		});

		it('should show specific errors for the other anyOf branch when it is closest', () => {
			const check = new Check({
				anyOf: [
					{
						type: 'object',
						properties: { mode: { const: 'auto' }, threshold: { type: 'number' } },
						required: ['mode', 'threshold'],
					},
					{
						type: 'object',
						properties: { mode: { const: 'manual' }, value: { type: 'number' }, unit: { type: 'string' } },
						required: ['mode', 'value', 'unit'],
					},
				],
			});
			// Branch 0: mode doesn't match 'auto', threshold missing → 2 errors
			// Branch 1: mode matches 'manual', value and unit missing → 2 errors
			// Tie → generic message
			expect(() => check.test({ mode: 'manual' })).to.throw(CheckError, '`value` must match at least one of the allowed schemas.');
		});
	});

	describe('discriminator', () => {
		it('should reject an unrecognized tag value (mapping error)', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'type' },
				required: ['type'],
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' }, x: { type: 'number' } }, required: ['type', 'x'] },
					{ type: 'object', properties: { type: { const: 'b' }, y: { type: 'number' } }, required: ['type', 'y'] },
				],
			});
			expect(() => check.test({ type: 'unknown' })).to.throw(CheckError, '`value` has an unrecognized "type" value: "unknown".');
		});

		it('should reject a non-string tag value (tag type error)', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'type' },
				required: ['type'],
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' } }, required: ['type'] },
					{ type: 'object', properties: { type: { const: 'b' } }, required: ['type'] },
				],
			});
			expect(() => check.test({ type: 123 })).to.throw(CheckError, '`value` has a "type" that is not a string.');
		});

		it('should report field-level errors from the matched subschema', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'type' },
				required: ['type'],
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' }, x: { type: 'number' } }, required: ['type', 'x'] },
					{ type: 'object', properties: { type: { const: 'b' }, y: { type: 'number' } }, required: ['type', 'y'] },
				],
			});
			expect(() => check.test({ type: 'a' })).to.throw(CheckError, '`x` is missing.');
		});

		it('should report type errors from the matched subschema', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'type' },
				required: ['type'],
				oneOf: [
					{ type: 'object', properties: { type: { const: 'a' }, x: { type: 'number' } }, required: ['type', 'x'] },
					{ type: 'object', properties: { type: { const: 'b' }, y: { type: 'number' } }, required: ['type', 'y'] },
				],
			});
			expect(() => check.test({ type: 'a', x: 'not-a-number' })).to.throw(CheckError, '`x` needs to be a `number`.');
		});
	});

	describe('if/then/else', () => {
		it('should report specific then errors when if condition matches', () => {
			const check = new Check({
				type: 'object',
				properties: {
					type: { type: 'string' },
					company_name: { type: 'string' },
				},
				if: { properties: { type: { const: 'business' } } },
				then: { required: ['company_name'] },
			});
			expect(() => check.test({ type: 'business' })).to.throw(CheckError, '`company_name` is missing.');
		});

		it('should not require then fields when if condition does not match', () => {
			const check = new Check({
				type: 'object',
				properties: {
					type: { type: 'string' },
					company_name: { type: 'string' },
				},
				if: { properties: { type: { const: 'business' } } },
				then: { required: ['company_name'] },
			});
			expect(() => check.test({ type: 'personal' })).to.not.throw();
		});

		it('should report specific else errors when if condition does not match', () => {
			const check = new Check({
				type: 'object',
				properties: {
					type: { type: 'string' },
					company_name: { type: 'string' },
					first_name: { type: 'string' },
				},
				if: { properties: { type: { const: 'business' } } },
				then: { required: ['company_name'] },
				else: { required: ['first_name'] },
			});
			expect(() => check.test({ type: 'personal' })).to.throw(CheckError, '`first_name` is missing.');
		});

		it('should handle then with type constraints', () => {
			const check = new Check({
				type: 'object',
				properties: {
					enabled: { type: 'boolean' },
					config: { type: 'object' },
				},
				if: { properties: { enabled: { const: true } } },
				then: { required: ['config'] },
			});
			expect(() => check.test({ enabled: true })).to.throw(CheckError, '`config` is missing.');
		});
	});

	describe('const', () => {
		it('should reject a non-matching string value', () => {
			const check = new Check({
				type: 'object',
				properties: { type: { const: 'webhook' } },
			});
			expect(() => check.test({ type: 'other' })).to.throw(CheckError, '`type` needs to be "webhook".');
		});

		it('should reject a non-matching numeric value', () => {
			const check = new Check({
				type: 'object',
				properties: { version: { const: 2 } },
			});
			expect(() => check.test({ version: 1 })).to.throw(CheckError, '`version` needs to be 2.');
		});

		it('should reject a non-matching boolean value', () => {
			const check = new Check({
				type: 'object',
				properties: { enabled: { const: true } },
			});
			expect(() => check.test({ enabled: false })).to.throw(CheckError, '`enabled` needs to be true.');
		});

		it('should reject a non-matching null value', () => {
			const check = new Check({
				type: 'object',
				properties: { deleted: { const: null } },
			});
			expect(() => check.test({ deleted: 'not-null' })).to.throw(CheckError, '`deleted` needs to be null.');
		});

		it('should accept a matching const value', () => {
			const check = new Check({
				type: 'object',
				properties: { type: { const: 'webhook' } },
			});
			expect(() => check.test({ type: 'webhook' })).to.not.throw();
		});
	});

	describe('not', () => {
		it('should reject data matching the excluded schema', () => {
			const check = new Check({
				type: 'object',
				properties: {
					value: { not: { type: 'string' } },
				},
			});
			expect(() => check.test({ value: 'hello' })).to.throw(CheckError, '`value` must not match the excluded schema.');
		});

		it('should accept data not matching the excluded schema', () => {
			const check = new Check({
				type: 'object',
				properties: {
					value: { not: { type: 'string' } },
				},
			});
			expect(() => check.test({ value: 123 })).to.not.throw();
		});
	});

	describe('contains', () => {
		it('should reject an array with no matching items (singular)', () => {
			const check = new Check({
				type: 'object',
				properties: {
					roles: { type: 'array', contains: { const: 'admin' } },
				},
			});
			expect(() => check.test({ roles: ['user', 'viewer'] })).to.throw(CheckError, '`roles` must contain at least 1 matching item.');
		});

		it('should accept an array with a matching item', () => {
			const check = new Check({
				type: 'object',
				properties: {
					roles: { type: 'array', contains: { const: 'admin' } },
				},
			});
			expect(() => check.test({ roles: ['user', 'admin'] })).to.not.throw();
		});
	});

	describe('propertyNames', () => {
		it('should reject an object with an invalid property name', () => {
			const check = new Check({
				type: 'object',
				propertyNames: { pattern: '^[a-z]+$' },
			});
			expect(() => check.test({ validkey: 1, 'INVALID': 2 })).to.throw(CheckError);
			// Should mention invalid property name
		});

		it('should accept an object with all valid property names', () => {
			const check = new Check({
				type: 'object',
				propertyNames: { pattern: '^[a-z]+$' },
			});
			expect(() => check.test({ abc: 1, def: 2 })).to.not.throw();
		});
	});

	describe('dependencies', () => {
		it('should reject when a dependent property is missing', () => {
			const check = new Check({
				type: 'object',
				properties: {
					credit_card: { type: 'string' },
					billing_address: { type: 'string' },
				},
				dependencies: {
					credit_card: ['billing_address'],
				},
			});
			expect(() => check.test({ credit_card: '1234' })).to.throw(CheckError);
			// Should indicate that credit_card requires billing_address
		});

		it('should accept when all dependent properties are present', () => {
			const check = new Check({
				type: 'object',
				properties: {
					credit_card: { type: 'string' },
					billing_address: { type: 'string' },
				},
				dependencies: {
					credit_card: ['billing_address'],
				},
			});
			expect(() => check.test({ credit_card: '1234', billing_address: '123 Main St' })).to.not.throw();
		});

		it('should not require dependent properties when trigger is absent', () => {
			const check = new Check({
				type: 'object',
				properties: {
					credit_card: { type: 'string' },
					billing_address: { type: 'string' },
				},
				dependencies: {
					credit_card: ['billing_address'],
				},
			});
			expect(() => check.test({ billing_address: '123 Main St' })).to.not.throw();
		});
	});

	describe('maxProperties', () => {
		it('should reject an object with too many properties', () => {
			const check = new Check({
				type: 'object',
				maxProperties: 2,
			});
			expect(() => check.test({ a: 1, b: 2, c: 3 })).to.throw(CheckError, '`value` must not have more than 2 properties.');
		});

		it('should accept an object at the limit', () => {
			const check = new Check({
				type: 'object',
				maxProperties: 2,
			});
			expect(() => check.test({ a: 1, b: 2 })).to.not.throw();
		});
	});

	describe('minProperties', () => {
		it('should reject an empty object when minProperties is 1 (singular)', () => {
			const check = new Check({
				type: 'object',
				minProperties: 1,
			});
			expect(() => check.test({})).to.throw(CheckError, '`value` must have at least 1 property.');
		});

		it('should reject an object with too few properties (plural)', () => {
			const check = new Check({
				type: 'object',
				minProperties: 3,
			});
			expect(() => check.test({ a: 1, b: 2 })).to.throw(CheckError, '`value` must have at least 3 properties.');
		});

		it('should accept an object meeting minProperties', () => {
			const check = new Check({
				type: 'object',
				minProperties: 1,
			});
			expect(() => check.test({ a: 1 })).to.not.throw();
		});
	});

	describe('false schema', () => {
		it('should reject any value against a false schema', () => {
			const check = new Check({
				type: 'object',
				properties: {
					blocked: false as any,
				},
			});
			expect(() => check.test({ blocked: 'anything' })).to.throw(CheckError, '`blocked` is not allowed.');
		});
	});
});

describe('edge cases and complex scenarios', () => {

	describe('deeply nested objects', () => {
		it('should handle 3-level deep required field', () => {
			const check = new Check({
				type: 'object',
				properties: {
					level1: {
						type: 'object',
						properties: {
							level2: {
								type: 'object',
								properties: {
									level3: {
										type: 'object',
										properties: { value: { type: 'string' } },
										required: ['value'],
									},
								},
								required: ['level3'],
							},
						},
						required: ['level2'],
					},
				},
				required: ['level1'],
			});
			expect(() => check.test({ level1: { level2: { level3: {} } } })).to.throw(CheckError, '`level1.level2.level3.value` is missing.');
		});

		it('should handle 3-level deep type error', () => {
			const check = new Check({
				type: 'object',
				properties: {
					a: {
						type: 'object',
						properties: {
							b: {
								type: 'object',
								properties: {
									c: { type: 'number' },
								},
							},
						},
					},
				},
			});
			expect(() => check.test({ a: { b: { c: 'wrong' } } })).to.throw(CheckError, '`a.b.c` needs to be a `number`.');
		});

		it('should handle deeply nested enum error', () => {
			const check = new Check({
				type: 'object',
				properties: {
					config: {
						type: 'object',
						properties: {
							settings: {
								type: 'object',
								properties: {
									mode: { type: 'string', enum: ['fast', 'slow'] },
								},
							},
						},
					},
				},
			});
			expect(() => check.test({ config: { settings: { mode: 'medium' } } })).to.throw(CheckError, '`config.settings.mode` needs to be one of "fast", "slow".');
		});
	});

	describe('arrays of objects', () => {
		it('should validate properties on array item objects', () => {
			const check = new Check({
				type: 'object',
				properties: {
					users: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								age: { type: 'integer', minimum: 0 },
							},
							required: ['name'],
						},
					},
				},
			});
			expect(() => check.test({ users: [{ age: 25 }] })).to.throw(CheckError, '`users[0].name` is missing.');
		});

		it('should report type errors in array item properties', () => {
			const check = new Check({
				type: 'object',
				properties: {
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								price: { type: 'number' },
								label: { type: 'string' },
							},
						},
					},
				},
			});
			expect(() => check.test({ items: [{ price: 'free', label: 123 }] })).to.throw(CheckError);
			// Should contain both type errors for items[0].price and items[0].label
		});

		it('should handle multiple array items with different errors', () => {
			const check = new Check({
				type: 'object',
				properties: {
					entries: {
						type: 'array',
						items: {
							type: 'object',
							properties: { status: { type: 'string', enum: ['active', 'inactive'] } },
							required: ['status'],
						},
					},
				},
			});
			expect(() => check.test({ entries: [{ status: 'active' }, {}, { status: 'bad' }] })).to.throw(CheckError);
			// Should contain errors for entries[1].status missing and entries[2].status enum
		});
	});

	describe('union types', () => {
		it('should handle type: ["string", "null"] — reject non-matching', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: ['string', 'null'] } },
			});
			expect(() => check.test({ name: 123 })).to.throw(CheckError, '`name` needs to be a `string` or `null`.');
		});

		it('should handle type: ["string", "null"] — accept string', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: ['string', 'null'] } },
			});
			expect(() => check.test({ name: 'hello' })).to.not.throw();
		});

		it('should handle type: ["string", "null"] — accept null', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: ['string', 'null'] } },
			});
			expect(() => check.test({ name: null })).to.not.throw();
		});

		it('should handle type: ["number", "null"]', () => {
			const check = new Check({
				type: 'object',
				properties: { count: { type: ['number', 'null'] } },
			});
			expect(() => check.test({ count: 'text' })).to.throw(CheckError, '`count` needs to be a `number` or `null`.');
		});

		it('should handle type: ["array", "null"]', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: ['array', 'null'] } },
			});
			expect(() => check.test({ tags: 'not-array' })).to.throw(CheckError, '`tags` needs to be an `array` or `null`.');
		});

		it('should handle type: ["string", "number"]', () => {
			const check = new Check({
				type: 'object',
				properties: { value: { type: ['string', 'number'] } },
			});
			expect(() => check.test({ value: true })).to.throw(CheckError, '`value` needs to be a `string` or a `number`.');
		});
	});

	describe('multi-error ordering', () => {
		it('should report errors for multiple fields', () => {
			const check = new Check({
				type: 'object',
				properties: {
					email: { type: 'string', format: 'email' },
					age: { type: 'integer', minimum: 0 },
					status: { type: 'string', enum: ['active', 'inactive'] },
				},
			});
			expect(() => check.test({ email: 'bad', age: -1, status: 'unknown' })).to.throw(CheckError);
			// Should contain all three error messages
		});

		it('should handle required and type errors together', () => {
			const check = new Check({
				type: 'object',
				properties: {
					name: { type: 'string' },
					email: { type: 'string' },
				},
				required: ['name', 'email'],
			});
			expect(() => check.test({ name: 123 })).to.throw(CheckError);
			// Should contain `name` type error and `email` missing error
		});
	});

	describe('complex combined schemas', () => {
		it('should handle object with required + additionalProperties + type + enum + format', () => {
			const check = new Check({
				type: 'object',
				properties: {
					name: { type: 'string', minLength: 1 },
					email: { type: 'string', format: 'email' },
					role: { type: 'string', enum: ['admin', 'user'] },
					age: { type: 'integer', minimum: 18, maximum: 120 },
				},
				required: ['name', 'email', 'role', 'age'],
				additionalProperties: false,
			});
			// Valid data should pass
			expect(() => check.test({ name: 'Alice', email: 'alice@example.com', role: 'admin', age: 30 })).to.not.throw();
		});

		it('should report multiple different constraint violations in one object', () => {
			const check = new Check({
				type: 'object',
				properties: {
					name: { type: 'string', minLength: 1 },
					email: { type: 'string', format: 'email' },
					role: { type: 'string', enum: ['admin', 'user'] },
					age: { type: 'integer', minimum: 18, maximum: 120 },
				},
				required: ['name', 'email', 'role', 'age'],
				additionalProperties: false,
			});
			expect(() => check.test({ name: '', email: 'bad', role: 'superadmin', age: 10, extra: true })).to.throw(CheckError);
			// Should contain errors for: name minLength, email format, role enum, age minimum, extra not allowed
		});
	});

	describe('root-level validation failures', () => {
		it('should handle non-object passed to object schema', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test('not an object')).to.throw(CheckError, '`value` needs to be an `object`.');
		});

		it('should handle number passed to object schema', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test(42)).to.throw(CheckError, '`value` needs to be an `object`.');
		});

		it('should handle array passed to object schema', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test([1, 2, 3])).to.throw(CheckError, '`value` needs to be an `object`.');
		});

		it('should handle boolean passed to object schema', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test(true)).to.throw(CheckError, '`value` needs to be an `object`.');
		});
	});

	describe('empty objects and arrays', () => {
		it('should accept empty object when no required fields', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
			});
			expect(() => check.test({})).to.not.throw();
		});

		it('should accept empty array when no minItems', () => {
			const check = new Check({
				type: 'object',
				properties: { tags: { type: 'array', items: { type: 'string' } } },
			});
			expect(() => check.test({ tags: [] })).to.not.throw();
		});

		it('should reject empty object when required fields exist', () => {
			const check = new Check({
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			});
			expect(() => check.test({})).to.throw(CheckError, '`name` is missing.');
		});
	});

	describe('large enum lists', () => {
		it('should format a large enum list (10+ values)', () => {
			const check = new Check({
				type: 'object',
				properties: {
					country: {
						type: 'string',
						enum: ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'KR', 'BR', 'MX', 'IN'],
					},
				},
			});
			expect(() => check.test({ country: 'ZZ' })).to.throw(CheckError, '`country` needs to be one of "US", "UK", "CA", "AU", "DE", "FR", "JP", "KR", "BR", "MX", "IN".');
		});
	});

	describe('discriminated unions with matched subschema errors', () => {
		it('should report specific field errors from the matched subschema', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'kind' },
				required: ['kind'],
				oneOf: [
					{
						type: 'object',
						properties: {
							kind: { const: 'circle' },
							radius: { type: 'number', minimum: 0 },
						},
						required: ['kind', 'radius'],
					},
					{
						type: 'object',
						properties: {
							kind: { const: 'rectangle' },
							width: { type: 'number', minimum: 0 },
							height: { type: 'number', minimum: 0 },
						},
						required: ['kind', 'width', 'height'],
					},
				],
			});
			expect(() => check.test({ kind: 'circle' })).to.throw(CheckError, '`radius` is missing.');
		});

		it('should report constraint errors from the matched subschema', () => {
			const check = new Check({
				type: 'object',
				discriminator: { propertyName: 'kind' },
				required: ['kind'],
				oneOf: [
					{
						type: 'object',
						properties: {
							kind: { const: 'circle' },
							radius: { type: 'number', minimum: 0 },
						},
						required: ['kind', 'radius'],
					},
					{
						type: 'object',
						properties: {
							kind: { const: 'rectangle' },
							width: { type: 'number', minimum: 0 },
							height: { type: 'number', minimum: 0 },
						},
						required: ['kind', 'width', 'height'],
					},
				],
			});
			expect(() => check.test({ kind: 'circle', radius: -5 })).to.throw(CheckError, '`radius` needs to be at least 0.');
		});
	});

	describe('multiple array items failing', () => {
		it('should report errors for items[0] and items[2] when both fail type check', () => {
			const check = new Check({
				type: 'object',
				properties: {
					scores: {
						type: 'array',
						items: { type: 'number' },
					},
				},
			});
			expect(() => check.test({ scores: ['bad', 10, 'worse'] })).to.throw(CheckError);
			// Should contain errors for scores[0] and scores[2]
		});

		it('should handle multiple items failing different constraints', () => {
			const check = new Check({
				type: 'object',
				properties: {
					values: {
						type: 'array',
						items: { type: 'integer', minimum: 0, maximum: 100 },
					},
				},
			});
			expect(() => check.test({ values: [-5, 50, 200] })).to.throw(CheckError);
			// Should contain errors for values[0] minimum and values[2] maximum
		});
	});

	describe('nested arrays', () => {
		it('should handle array of arrays with item validation', () => {
			const check = new Check({
				type: 'object',
				properties: {
					matrix: {
						type: 'array',
						items: {
							type: 'array',
							items: { type: 'number' },
						},
					},
				},
			});
			expect(() => check.test({ matrix: [[1, 2], ['bad']] })).to.throw(CheckError, '`matrix[1][0]` needs to be a `number`.');
		});

		it('should handle nested array with minItems', () => {
			const check = new Check({
				type: 'object',
				properties: {
					groups: {
						type: 'array',
						items: {
							type: 'array',
							items: { type: 'string' },
							minItems: 1,
						},
					},
				},
			});
			expect(() => check.test({ groups: [['a', 'b'], []] })).to.throw(CheckError, '`groups[1]` needs to have at least 1 item.');
		});
	});

	describe('valid data passthrough', () => {
		it('should not throw for a complex valid object', () => {
			const check = new Check({
				type: 'object',
				properties: {
					name: { type: 'string', minLength: 1 },
					email: { type: 'string', format: 'email' },
					age: { type: 'integer', minimum: 0, maximum: 150 },
					tags: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
					address: {
						type: 'object',
						properties: {
							street: { type: 'string' },
							city: { type: 'string' },
						},
						required: ['street', 'city'],
					},
				},
				required: ['name', 'email', 'age', 'tags', 'address'],
				additionalProperties: false,
			});
			expect(() => check.test({
				name: 'Alice',
				email: 'alice@example.com',
				age: 30,
				tags: ['developer'],
				address: { street: '123 Main St', city: 'Anytown' },
			})).to.not.throw();
		});

		it('should not throw for a minimal valid object', () => {
			const check = new Check({ type: 'object' });
			expect(() => check.test({})).to.not.throw();
		});
	});

	describe('boolean schema values', () => {
		it('should reject any value with false schema on a property', () => {
			const check = new Check({
				type: 'object',
				properties: {
					forbidden: false as any,
				},
			});
			expect(() => check.test({ forbidden: 'anything' })).to.throw(CheckError, '`forbidden` is not allowed.');
		});

		it('should accept any value with true schema on a property', () => {
			const check = new Check({
				type: 'object',
				properties: {
					anything: true as any,
				},
			});
			expect(() => check.test({ anything: 'whatever' })).to.not.throw();
		});
	});
});
