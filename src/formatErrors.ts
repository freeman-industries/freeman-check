import type { ErrorObject } from 'ajv';
import anora from 'anora';

/**
 * Converts a JSON Pointer path to dot/bracket notation.
 * /users/0/email → users[0].email
 * /tags/0 → tags[0]
 */
function convertPath(instancePath: string): string {
	return instancePath
		.slice(1)                       // Remove leading /
		.replace(/\/(\d+)/g, '[$1]')    // Convert /0 to [0] (array indices)
		.replace(/^(\d+)/, '[$1]')      // Convert leading digit to [0] (root array index)
		.replace(/\//g, '.');            // Convert remaining / to . (object keys)
}

/**
 * Returns the singular or plural form based on count.
 */
function pluralize(count: number, singular: string, plural: string): string {
	return count === 1 ? singular : plural;
}

/**
 * Converts an AJV instancePath (JSON Pointer) to a human-readable field name.
 * Uses bracket notation for array indices to match jsonschema's behavior.
 *
 * Examples:
 *   "" → "value" (root-level)
 *   "/email" → "email"
 *   "/users/0/email" → "users[0].email"
 *   "/event/metadata/path" → "event.metadata.path"
 */
function extractFieldName(error: ErrorObject): string {
	const { instancePath, keyword, params } = error;

	// For 'required', the missing field is in params.missingProperty
	if (keyword === 'required') {
		const parent = instancePath ? convertPath(instancePath) : '';
		const field = (params as { missingProperty: string }).missingProperty;
		return parent ? `${parent}.${field}` : field;
	}

	// For 'additionalProperties', the extra field is in params.additionalProperty
	if (keyword === 'additionalProperties') {
		const parent = instancePath ? convertPath(instancePath) : '';
		const field = (params as { additionalProperty: string }).additionalProperty;
		return parent ? `${parent}.${field}` : field;
	}

	// For 'unevaluatedProperties', the extra field is in params.unevaluatedProperty
	if (keyword === 'unevaluatedProperties') {
		const parent = instancePath ? convertPath(instancePath) : '';
		const field = (params as { unevaluatedProperty: string }).unevaluatedProperty;
		return parent ? `${parent}.${field}` : field;
	}

	// For everything else, use instancePath
	if (!instancePath || instancePath === '') {
		return 'value';
	}

	return convertPath(instancePath);
}

/**
 * Converts an AJV error into a human-readable problem description.
 * Handles all standard JSON Schema keywords with backwards-compatible messages.
 */
function formatProblem(error: ErrorObject): string {
	switch (error.keyword) {
		case 'additionalProperties': {
			return 'is not allowed';
		}

		case 'unevaluatedProperties': {
			return 'is not allowed';
		}

		case 'required': {
			return 'is missing';
		}

		case 'format': {
			return `needs to be formatted as \`${(error.params as { format: string }).format}\``;
		}

		case 'type': {
			const typeParam = (error.params as { type: string | string[] }).type;

			// AJV provides an array for union types like type: ["string", "null"]
			// and a comma-separated string in some contexts
			const types = Array.isArray(typeParam)
				? typeParam
				: typeof typeParam === 'string' && typeParam.includes(',')
					? typeParam.split(',')
					: null;

			if (types && types.length > 1) {
				const formatted = types.map((t, i) => {
					const article = i === 0 ? anora(t) + ' ' : '';
					// Only add article for non-null types after the first
					if (i > 0 && t !== 'null') {
						return `${anora(t)} \`${t}\``;
					}
					return `${article}\`${t}\``;
				});

				// Two types: "a `string` or `null`"
				// Three+ types: "a `string`, a `number`, or `null`" (Oxford comma)
				if (formatted.length === 2) {
					return `needs to be ${formatted[0]} or ${formatted[1]}`;
				}

				const last = formatted[formatted.length - 1];
				const rest = formatted.slice(0, -1);
				return `needs to be ${rest.join(', ')}, or ${last}`;
			}

			const singleType = Array.isArray(typeParam) ? typeParam[0] : typeParam;
			return `needs to be ${anora(singleType)} \`${singleType}\``;
		}

		case 'enum': {
			const allowedValues = (error.params as { allowedValues: unknown[] }).allowedValues;
			const quoted = allowedValues.map((v) => `"${v}"`);
			if (allowedValues.length === 1) {
				return `needs to be ${quoted[0]}`;
			}
			return `needs to be one of ${quoted.join(', ')}`;
		}

		case 'minimum': {
			return `needs to be at least ${(error.params as { limit: number }).limit}`;
		}

		case 'maximum': {
			return `needs to be at most ${(error.params as { limit: number }).limit}`;
		}

		case 'exclusiveMinimum': {
			return `needs to be greater than ${(error.params as { limit: number }).limit}`;
		}

		case 'exclusiveMaximum': {
			return `needs to be less than ${(error.params as { limit: number }).limit}`;
		}

		case 'multipleOf': {
			return `needs to be a multiple of ${(error.params as { multipleOf: number }).multipleOf}`;
		}

		case 'minLength': {
			const limit = (error.params as { limit: number }).limit;
			return `needs to have at least ${limit} ${pluralize(limit, 'character', 'characters')}`;
		}

		case 'maxLength': {
			return `needs to have at most ${(error.params as { limit: number }).limit} characters`;
		}

		case 'pattern': {
			return 'is not in the expected format';
		}

		case 'minItems': {
			const limit = (error.params as { limit: number }).limit;
			return `needs to have at least ${limit} ${pluralize(limit, 'item', 'items')}`;
		}

		case 'maxItems': {
			return `needs to have at most ${(error.params as { limit: number }).limit} items`;
		}

		case 'uniqueItems': {
			return 'must not have duplicate items';
		}

		case 'const': {
			const allowedValue = (error.params as { allowedValue: unknown }).allowedValue;
			if (typeof allowedValue === 'string') {
				return `needs to be "${allowedValue}"`;
			}
			return `needs to be ${JSON.stringify(allowedValue)}`;
		}

		case 'not': {
			return 'must not match the excluded schema';
		}

		case 'oneOf': {
			return 'must match exactly one of the allowed schemas';
		}

		case 'anyOf': {
			return 'must match at least one of the allowed schemas';
		}

		case 'if': {
			return 'does not satisfy the conditional requirement';
		}

		case 'contains': {
			const min = (error.params as { min?: number }).min ?? 1;
			return `must contain at least ${min} matching ${pluralize(min, 'item', 'items')}`;
		}

		case 'propertyNames': {
			return `has an invalid property name: "${(error.params as { propertyName: string }).propertyName}"`;
		}

		case 'additionalItems': {
			return `must not have more than ${(error.params as { limit: number }).limit} items`;
		}

		case 'unevaluatedItems': {
			return `must not have more than ${(error.params as { len: number }).len} items`;
		}

		case 'dependencies': {
			const property = (error.params as { property: string }).property;
			const deps = (error.params as { deps: string }).deps;
			return `has "${property}" which requires "${deps}"`;
		}

		case 'dependentRequired': {
			const property = (error.params as { property: string }).property;
			const deps = (error.params as { deps: string }).deps;
			return `has "${property}" which requires "${deps}"`;
		}

		case 'maxProperties': {
			return `must not have more than ${(error.params as { limit: number }).limit} properties`;
		}

		case 'minProperties': {
			const limit = (error.params as { limit: number }).limit;
			return `must have at least ${limit} ${pluralize(limit, 'property', 'properties')}`;
		}

		case 'discriminator': {
			const discError = error.params as { error?: string; tag?: string; tagValue?: string };
			if (discError.error === 'mapping') {
				return `has an unrecognized "${discError.tag}" value: "${discError.tagValue}"`;
			}
			return `has a "${discError.tag}" that is not a string`;
		}

		case 'false schema': {
			return 'is not allowed';
		}

		default: {
			return 'is invalid';
		}
	}
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * For a given oneOf/anyOf parent error, groups child errors by subschema
 * branch index and returns errors from the branch with the fewest failures.
 *
 * Returns the "best match" branch's errors if one branch has strictly fewer
 * errors than all others, or null if there's a tie (ambiguous).
 *
 * For oneOf with passingSchemas !== null (multiple schemas matched), returns
 * null immediately — the problem is "too many matched" and branch errors
 * are irrelevant.
 */
function findBestBranchErrors(
	parentError: ErrorObject,
	childErrors: ErrorObject[]
): ErrorObject[] | null {
	// For oneOf with multiple passing schemas, can't improve on generic message
	if (parentError.keyword === 'oneOf') {
		const params = parentError.params as { passingSchemas: number[] | null };
		if (params.passingSchemas !== null) {
			return null;
		}
	}

	const parentSchemaPath = parentError.schemaPath;

	// Group child errors by branch index under this parent
	// Parent schemaPath: '#/oneOf' or '#/properties/value/anyOf'
	// Child schemaPath:  '#/oneOf/0/properties/type/const' → branch 0
	const branchPattern = new RegExp(escapeRegex(parentSchemaPath) + '/(\\d+)/');
	const branches = new Map<number, ErrorObject[]>();

	for (const child of childErrors) {
		const match = child.schemaPath.match(branchPattern);
		if (!match || !match[1]) continue;
		const index = parseInt(match[1], 10);
		if (!branches.has(index)) branches.set(index, []);
		branches.get(index)!.push(child);
	}

	// Need at least 2 branches with errors to compare
	if (branches.size < 2) return null;

	// Sort branches by error count (ascending)
	const sorted = [...branches.values()].sort((a, b) => a.length - b.length);

	const first = sorted[0];
	const second = sorted[1];

	// Clear winner: strictly fewer errors than the next best
	if (first && second && first.length < second.length) {
		return first;
	}

	// Tie — no clear winner
	return null;
}

/**
 * Filters, maps, and deduplicates AJV errors into field/problem tuples.
 *
 * - Filters out child errors from oneOf/anyOf compounds (unless discriminator is present)
 * - Filters generic `if` errors when more specific then/else errors exist
 * - Deduplicates by (field, problem) tuple
 */
function normalizeErrors(errors: ErrorObject[]): Array<{ field: string; problem: string }> {
	// Step 1: Identify parent-level compound errors
	const hasOneOfError = errors.some((e) => e.keyword === 'oneOf');
	const hasAnyOfError = errors.some((e) => e.keyword === 'anyOf');
	const hasDiscriminator = errors.some((e) => e.keyword === 'discriminator');

	let filtered = errors;

	// Step 2: Resolve oneOf/anyOf errors (unless discriminator present)
	// When no discriminator, attempt to find the "best matching" subschema branch
	// (the one with fewest errors). If found, surface that branch's specific errors
	// instead of the generic oneOf/anyOf parent message.
	if ((hasOneOfError || hasAnyOfError) && !hasDiscriminator) {
		const childRegex = /\/(oneOf|anyOf)\/\d+\//;
		const parentErrors = errors.filter(
			(e) => e.keyword === 'oneOf' || e.keyword === 'anyOf'
		);
		const childErrors = errors.filter(
			(e) => e.keyword !== 'oneOf' && e.keyword !== 'anyOf' && childRegex.test(e.schemaPath)
		);
		const otherErrors = errors.filter(
			(e) => e.keyword !== 'oneOf' && e.keyword !== 'anyOf' && !childRegex.test(e.schemaPath)
		);

		const resolved: ErrorObject[] = [...otherErrors];

		for (const parent of parentErrors) {
			const bestBranch = findBestBranchErrors(parent, childErrors);
			if (bestBranch) {
				// Clear winner found — use specific branch errors
				resolved.push(...bestBranch);
			} else {
				// Tie or can't determine — fall back to generic parent error
				resolved.push(parent);
			}
		}

		filtered = resolved;
	}

	// Step 3: Filter generic `if` errors when specific then/else errors exist
	const hasIfError = filtered.some((e) => e.keyword === 'if');
	if (hasIfError) {
		const hasSpecificErrors = filtered.some(
			(e) => e.schemaPath.includes('/then/') || e.schemaPath.includes('/else/')
		);
		if (hasSpecificErrors) {
			filtered = filtered.filter((e) => e.keyword !== 'if');
		}
	}

	// Step 4: Map to { field, problem } tuples
	const results = filtered.map((error) => ({
		field: extractFieldName(error),
		problem: formatProblem(error),
	}));

	// Step 5: Deduplicate by (field, problem) tuple
	const seen = new Set<string>();
	return results.filter(({ field, problem }) => {
		const key = `${field}::${problem}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Assembles normalized errors into the final error string.
 * Format: `field1` problem1. `field2` problem2.
 */
function formatMessage(normalized: Array<{ field: string; problem: string }>): string {
	return normalized.map(({ field, problem }) => `\`${field}\` ${problem}.`).join(' ');
}

export { extractFieldName, formatProblem, normalizeErrors, formatMessage };
