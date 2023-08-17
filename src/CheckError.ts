import { Schema } from 'jsonschema';

/**
 * Custom error class representing a validation error for a specific schema.
 *
 * @extends {Error}
 */
export class CheckError extends Error {
	/**
	 * The schema that failed to validate.
	 *
	 * @type {Schema | undefined}
	 */
	schema: Schema | undefined;

	/**
	 * The input that caused the validation error.
	 *
	 * @type {any}
	 */
	input: any;

	/**
	 * Creates a new instance of CheckError.
	 *
	 * @param {string} message - The error message describing the validation failure.
	 * @param {Schema} [schema] - The schema that failed to validate (optional).
	 * @param {any} [input] - The input that caused the validation error.
	 */
	constructor(message: string, schema?: Schema, input?: any) {
		super(message);
		this.name = 'CheckError';
		this.schema = schema;
		this.input = input;
	}
}
