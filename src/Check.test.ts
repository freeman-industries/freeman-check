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
