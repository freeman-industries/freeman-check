import { expect } from 'chai';
import { CheckError } from './CheckError';
import { Schema } from 'jsonschema';

describe('CheckError', () => {
	it('should set the message property correctly', () => {
		const error = new CheckError('Test error message');
		expect(error.message).to.equal('Test error message');
	});

	it('should extend the native Error class', () => {
		const error = new CheckError('Test error message');
		expect(error).to.be.instanceOf(Error);
	});

	it('should set the name property to "CheckError"', () => {
		const error = new CheckError('Test error message');
		expect(error.name).to.equal('CheckError');
	});

	it('should handle the schema property when provided', () => {
		const schema: Schema = { type: 'object' };
		const error = new CheckError('Test error message', schema);
		expect(error.schema).to.deep.equal(schema);
	});

	it('should handle the schema property when omitted', () => {
		const error = new CheckError('Test error message');
		expect(error.schema).to.be.undefined;
	});
});
