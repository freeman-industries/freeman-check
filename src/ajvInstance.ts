import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Shared AJV instance configured for freeman-check.
 *
 * - allErrors: collect ALL validation errors, not just the first
 * - discriminator: enable discriminator keyword for oneOf unions
 * - strict: false to allow unknown keywords in schemas (backwards compat)
 * - messages: include default messages for debugging
 * - verbose: false to omit schema/data from error objects (performance)
 */
const ajv = new Ajv({
	allErrors: true,
	discriminator: true,
	strict: false,
	messages: true,
	verbose: false,
});

addFormats(ajv);

export { ajv };
