import { expect } from 'chai';
import { Check } from './Check';
import { CheckError } from './CheckError';

describe('Check class', () => {
	// Schema for testing
	const schema = {
		type: 'object',
		properties: {
			name: { type: 'string' },
			email: { type: 'string', format: 'email' },
			favourite_films: { type: 'array', items: { type: 'string' } },
		},
		required: ['name', 'email', 'favourite_films'],
	};

	describe('constructor', () => {
		it('should throw an error if no schema is provided', () => {
			// @ts-expect-error, we are confirming the runtime check is OK.
			expect(() => new Check()).to.throw(CheckError, 'Schema must be defined in constructor.');
		});

		it('should create a Check instance with a valid schema', () => {
			const check = new Check(schema);
			expect(check).to.be.instanceOf(Check);
		});
	});

	describe('test method', () => {
		const check = () => new Check(schema);

		it('should throw an error if object is null or undefined', () => {
			expect(() => check().test(null)).to.throw(CheckError, 'The first argument is null or undefined.');
			expect(() => check().test(undefined)).to.throw(CheckError, 'The first argument is null or undefined.');
		});

		it('should not throw an error if object is valid', () => {
			const object = {
				name: 'John Doe',
				email: 'john.doe@example.com',
				favourite_films: ['Film1', 'Film2'],
			};
			expect(() => check().test(object)).to.not.throw();
		});

		it('should throw an error if object is missing required fields', () => {
			const object = {
				name: 'John Doe',
				favourite_films: ['Film1', 'Film2'],
			};
			expect(() => check().test(object)).to.throw(CheckError, '`email` is missing.');
		});

		it('should throw an error if object has malformatted fields', () => {
			const object = {
				name: 'John Doe',
				email: 'invalid-email',
				favourite_films: ['Film1', 'Film2'],
			};
			expect(() => check().test(object)).to.throw(CheckError, '`email` is malformatted.');
		});

		it('should throw an error if object has additional properties', () => {
			const object = {
				name: 'John Doe',
				email: 'john.doe@example.com',
				favourite_films: ['Film1', 'Film2'],
				extra_field: 'extra',
			};
			expect(() => check().test(object)).to.throw(CheckError, '`extra_field` is not allowed.');
		});

		it('should throw an error if object has incorrect type', () => {
			const object = {
				name: 'John Doe',
				email: 'john.doe@example.com',
				favourite_films: 'Film1', // This should be an array
			};
			expect(() => check().test(object)).to.throw(CheckError, '`favourite_films` needs to be an `array`.');
		});
	});
});
