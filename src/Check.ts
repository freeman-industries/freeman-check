import { ValidateFunction, SchemaObject } from 'ajv';
import anora from 'anora';
import { CheckError } from './CheckError';
import { ajv } from './ajvInstance';
import { normalizeSchema } from './normalizeSchema';
import { normalizeErrors, formatMessage } from './formatErrors';

/**
 * Parses an AJV schema compilation error message and returns a clean,
 * deduplicated human-readable message.
 *
 * AJV error format: "schema is invalid: data/path message, data/path message, ..."
 * The same path+message can repeat up to 8 times due to multiple meta-schema validations.
 *
 * Output format: 'Schema is invalid: "path" message. "path2" message2.'
 */
function formatSchemaError(rawMessage: string): string {
	// Strip the "schema is invalid: " prefix
	const prefix = 'schema is invalid: ';
	if (!rawMessage.startsWith(prefix)) {
		return rawMessage;
	}

	const body = rawMessage.slice(prefix.length);

	// Split on ", data" boundaries to get individual error fragments.
	// Each fragment looks like: "data/items must be object,boolean"
	// We split on ", data" and re-prepend "data" to each fragment after the first.
	const rawParts = body.split(', data');
	const parts: string[] = [];
	for (let i = 0; i < rawParts.length; i++) {
		const raw = rawParts[i];
		if (raw === undefined) continue;
		const part = i === 0 ? raw : 'data' + raw;
		parts.push(part.trim());
	}

	// Deduplicate exact fragments
	const unique = [...new Set(parts)];

	// Convert each fragment from "data/path message" to '"path" message'
	const formatted: string[] = [];
	for (const part of unique) {
		// Match: "data" optionally followed by "/path/segments" then " message"
		const match = part.match(/^data(?:\/([^\s]+))?\s+(.+)$/);
		if (!match) {
			formatted.push(part);
			continue;
		}

		const rawPath = match[1] ?? '';
		const message = match[2]!;

		// Convert path: "items" → "items", "properties/name/type" → "properties.name.type"
		const dotPath = rawPath.replace(/\//g, '.');

		// Clean up AJV type lists: "object,boolean" → "an object or boolean"
		const cleanMessage = cleanTypeList(message);

		if (dotPath) {
			formatted.push(`"${dotPath}" ${cleanMessage}`);
		} else {
			formatted.push(cleanMessage);
		}
	}

	return `Schema is invalid: ${formatted.join('. ')}.`;
}

/**
 * Cleans up AJV type constraint messages.
 * "must be object,boolean" → "must be an object or boolean"
 * "must be string" → "must be a string"
 * "must be array" → "must be an array"
 */
function cleanTypeList(message: string): string {
	// Match "must be type1,type2,..." pattern
	const typeListMatch = message.match(/^must be ([a-z,]+)$/);
	if (!typeListMatch) {
		return message;
	}

	const types = typeListMatch[1]!.split(',');

	if (types.length === 1) {
		return `must be ${anora(types[0])} ${types[0]}`;
	}

	// For multiple types: "an object or boolean"
	const last = types[types.length - 1];
	const rest = types.slice(0, -1);

	const parts: string[] = [];
	for (const type of rest) {
		parts.push(`${anora(type)} ${type}`);
	}

	return `must be ${parts.join(', ')} or ${last}`;
}

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

		try {
			this.validate = ajv.compile(normalizeSchema(schema));
		} catch (error: unknown) {
			const rawMessage = error instanceof Error ? error.message : String(error);
			throw new CheckError(formatSchemaError(rawMessage), schema);
		}
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
