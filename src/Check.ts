import { ValidateFunction, SchemaObject } from 'ajv';
import { CheckError } from './CheckError';
import { ajv } from './ajvInstance';
import { normalizeSchema } from './normalizeSchema';
import { normalizeErrors, formatMessage } from './formatErrors';

/**
 * A class to perform validation on objects according to a specified schema.
 */
export class Check {
	private schema: SchemaObject;
	private validate: ValidateFunction;

	/**
	 * Constructs a new Check instance.
	 * @param schema - The JSON Schema used for validation.
	 * @throws {CheckError} Throws an error if the schema is not provided.
	 */
	constructor(schema: SchemaObject) {
		if (!schema) throw new CheckError('Schema must be defined in constructor.');

		this.schema = schema;
		this.validate = ajv.compile(normalizeSchema(schema));
	}

	/**
	 * Tests an object against the predefined schema.
	 * @param object - The object to validate.
	 * @throws {CheckError} Throws an error if the object does not conform to the schema.
	 */
	test(object: unknown): void {
		if (object === null || object === undefined) {
			throw new CheckError('The first argument is null or undefined.');
		}

		const valid = this.validate(object);

		if (valid) return;

		const errors = this.validate.errors ?? [];
		const normalized = normalizeErrors(errors);
		const message = formatMessage(normalized);

		throw new CheckError(message, this.schema, object);
	}
}
