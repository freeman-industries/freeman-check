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
	 * Creates a new instance of CheckError.
	 *
	 * @param {string} message - The error message describing the validation failure.
	 * @param {Schema} [schema] - The schema that failed to validate (optional).
	 */
	constructor(message: string, schema?: Schema) {
		super(message);
		this.name = 'CheckError';
		this.schema = schema;
	}
}
