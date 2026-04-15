import { Check } from './Check';
import { CheckError } from './CheckError';

export { Check };
export { CheckError };

/**
 * JSON Schema type for use with Check constructor.
 * Sourced from AJV's SchemaObject for compatibility.
 */
export type { SchemaObject as Schema } from 'ajv';
