import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

/**
 * Shared AJV instance configured for freeman-check.
 *
 * Uses Ajv2020 to support JSON Schema 2020-12 keywords including
 * dependentRequired, unevaluatedProperties, unevaluatedItems, and prefixItems.
 *
 * - allErrors: collect ALL validation errors, not just the first
 * - discriminator: enable discriminator keyword for oneOf unions
 * - strict: false to allow unknown keywords in schemas (backwards compat)
 * - messages: include default messages for debugging
 * - verbose: false to omit schema/data from error objects (performance)
 */
const ajv = new Ajv2020({
	allErrors: true,
	discriminator: true,
	strict: false,
	messages: true,
	verbose: false,
});

addFormats(ajv);

export { ajv };
