import assert from 'assert';
import { CheckError } from './CheckError';
import { validate, Schema } from 'jsonschema';
import anora from 'anora';

/**
 * A class to perform validation on objects according to a specified schema.
 */
export class Check {
	private schema: Schema;

	/**
	 * Constructs a new Check instance.
	 * @param schema - The JSON Schema used for validation.
	 * @throws {CheckError} Throws an error if the schema is not provided.
	 */
	constructor(schema: Schema) {
		assert(schema, new CheckError(`Schema must be defined in constructor.`));

		this.schema = schema;
	}

	/**
	 * Tests an object against the predefined schema.
	 * @param object - The object to validate.
	 * @throws {CheckError} Throws an error if the object does not conform to the schema or if the schema is not initialized.
	 */
	test(object: unknown) {
		if (object === null || object === undefined) {
			throw new CheckError('The first argument is null or undefined.');
		}

		assert(this.schema, new CheckError(`test can't be called on Check instances initialized without a schema.`));

		// validate.
		const result = validate(object, this.schema);

		// if there are no errors, the object is valid.
		if (result.errors.length === 0) {
			return;
		}

		// init error string
		let error_message = '';

		result.errors.forEach(error => {
			let subject = String(error.argument); // name, email, etc.
			let problem = 'is incorrect'; // default

			// assign plain English to error messages.
			switch (error.name) {
				case 'additionalProperties':
					problem = 'is not allowed';
					break;
				case 'required':
					problem = 'is missing';
					break;
				case 'format':
					problem = 'is malformatted';
					break;
				case 'type':
					subject = error.property.replace('instance.', '');

					let type: string | undefined = undefined;

					if (typeof error.schema === 'string') {
						type = error.schema;
					} else if (typeof error.schema.type !== 'string') {
						type = JSON.stringify(error.schema.type);
					} else {
						type = error.schema.type;
					}

					assert(
						type,
						new CheckError(`Validation failed, and then there was an internal error while determining the required type of ${subject}.`)
					);

					problem = 'needs to be ' + anora(type) + ' `' + type + '`';
					break;
			}

			// concatenate all validation errors.
			error_message += '`' + subject + '` ' + problem + '. ';
		});

		// remove last character from concatenated error message.
		error_message = error_message.slice(0, -1);

		const error = new CheckError(error_message, this.schema);

		throw error;
	}
}
