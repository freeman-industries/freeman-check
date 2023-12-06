import { expect } from 'chai';
import { Check } from './Check';
import { CheckError } from './CheckError';
import { Schema } from 'jsonschema';

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
		});
	});
});
