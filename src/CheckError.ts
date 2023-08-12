import { Schema } from 'jsonschema';

export class CheckError extends Error {
	schema: Schema | undefined;

	constructor(message: string, schema?: Schema) {
		super(message);
		this.name = 'CheckError';
		this.schema = schema;
	}
}
