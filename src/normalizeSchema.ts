import { SchemaObject } from 'ajv';

/**
 * Schema keywords whose values are arrays of sub-schemas.
 * Each sub-schema in the array must be descended into.
 */
const ARRAY_OF_SCHEMAS_KEYWORDS = [
	'oneOf',
	'anyOf',
	'allOf',
	'prefixItems',
] as const;

/**
 * Schema keywords whose values are single sub-schemas (object or boolean).
 * Each must be descended into if it's an object.
 */
const SINGLE_SCHEMA_KEYWORDS = [
	'not',
	'if',
	'then',
	'else',
	'contains',
	'items',
] as const;

/**
 * Schema keywords whose values are maps of property-name → sub-schema.
 * Each sub-schema value must be descended into.
 */
const MAP_OF_SCHEMAS_KEYWORDS = [
	'properties',
	'patternProperties',
	'dependentSchemas',
	'$defs',
	'definitions',
] as const;

/**
 * Deep-clones a JSON Schema and recursively normalizes legacy Draft-07/Draft-04
 * syntax to 2020-12 equivalents:
 *
 * - `items: [schemaA, schemaB]` → `prefixItems: [schemaA, schemaB]`
 * - `additionalItems: <value>` → `items: <value>`
 * - If `additionalItems` is absent, `items` defaults to `false`
 * - `{ minimum: N, exclusiveMinimum: true }` → `{ exclusiveMinimum: N }`
 * - `{ maximum: N, exclusiveMaximum: true }` → `{ exclusiveMaximum: N }`
 * - `id: <string>` is stripped (Ajv2020 rejects it; use `$id` instead)
 *
 * The original schema is never mutated.
 */
export function normalizeSchema(schema: SchemaObject): SchemaObject {
	const cloned = structuredClone(schema);
	normalizeNode(cloned);
	return cloned;
}

/**
 * Recursively normalizes a single schema node in-place.
 * Only call this on a cloned schema — it mutates the node.
 */
function normalizeNode(node: Record<string, unknown>): void {
	if (typeof node !== 'object' || node === null) {
		return;
	}

	// --- Convert legacy tuple syntax ---
	if (Array.isArray(node.items) && node.items.length > 0) {
		// Move items array to prefixItems
		node.prefixItems = node.items;

		// Convert additionalItems → items (default to false if absent)
		if ('additionalItems' in node) {
			node.items = node.additionalItems;
			delete node.additionalItems;
		} else {
			node.items = false;
		}
	} else if (Array.isArray(node.items) && node.items.length === 0) {
		// Empty tuple: no prefixItems needed (empty array is a no-op)
		// Still convert additionalItems → items (default to false if absent)
		if ('additionalItems' in node) {
			node.items = node.additionalItems;
			delete node.additionalItems;
		} else {
			node.items = false;
		}
	}

	// --- Convert Draft-04 boolean exclusiveMinimum ---
	if (node.exclusiveMinimum === true && typeof node.minimum === 'number') {
		node.exclusiveMinimum = node.minimum;
		delete node.minimum;
	}

	// --- Convert Draft-04 boolean exclusiveMaximum ---
	if (node.exclusiveMaximum === true && typeof node.maximum === 'number') {
		node.exclusiveMaximum = node.maximum;
		delete node.maximum;
	}

	// --- Strip legacy id keyword (Ajv2020 rejects it) ---
	if ('id' in node && typeof node.id === 'string') {
		delete node.id;
	}

	// --- Descend into array-of-schemas keywords ---
	for (const keyword of ARRAY_OF_SCHEMAS_KEYWORDS) {
		const value = node[keyword];
		if (Array.isArray(value)) {
			for (const subSchema of value) {
				if (typeof subSchema === 'object' && subSchema !== null) {
					normalizeNode(subSchema as Record<string, unknown>);
				}
			}
		}
	}

	// --- Descend into single-schema keywords ---
	for (const keyword of SINGLE_SCHEMA_KEYWORDS) {
		const value = node[keyword];
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			normalizeNode(value as Record<string, unknown>);
		}
	}

	// --- Descend into map-of-schemas keywords ---
	for (const keyword of MAP_OF_SCHEMAS_KEYWORDS) {
		const value = node[keyword];
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			for (const key of Object.keys(value as Record<string, unknown>)) {
				const subSchema = (value as Record<string, unknown>)[key];
				if (typeof subSchema === 'object' && subSchema !== null) {
					normalizeNode(subSchema as Record<string, unknown>);
				}
			}
		}
	}
}
