# Technical Specification: freeman-check Migration from jsonschema to AJV

**Date:** 2026-04-14  
**Status:** Draft  
**Package:** `freeman-check` (v3.0.6 → v4.0.0)

---

## Table of Contents

1. [Goals and Non-Goals](#1-goals-and-non-goals)
2. [Current State Analysis](#2-current-state-analysis)
3. [Architecture](#3-architecture)
4. [Error Message Formatting Engine](#4-error-message-formatting-engine)
5. [Backwards Compatibility](#5-backwards-compatibility)
6. [New Error Messages](#6-new-error-messages)
7. [Testing Strategy](#7-testing-strategy)
8. [Migration Guide for Consuming Projects](#8-migration-guide-for-consuming-projects)
9. [Edge Cases](#9-edge-cases)
10. [Dependencies](#10-dependencies)

---

## 1. Goals and Non-Goals

### Goals

1. **Replace `jsonschema` with AJV** as the validation engine inside `freeman-check`, eliminating known production bugs caused by unhandled error types falling through to the default `` `{arg}` is incorrect `` message.

2. **Preserve exact backwards compatibility** for the 5 currently-handled error types (`additionalProperties`, `required`, `format`, `type`, `enum`). All consuming project tests asserting these error messages MUST pass unchanged.

3. **Produce proper, helpful error messages** for ALL other validation keywords — `oneOf`, `anyOf`, `pattern`, `minimum`, `maximum`, `uniqueItems`, `minLength`, `maxLength`, `minItems`, `maxItems`, `const`, `not`, `if`/`then`/`else`, `discriminator`, and every other AJV keyword.

4. **Comprehensive test coverage** inside freeman-check itself, so that every error keyword has at least one test proving the message format.

5. **Drop-in replacement** — the public API (`Check`, `CheckError`, `Schema` type) must remain identical. No changes to consuming code should be required beyond updating the package version.

6. **Leverage AJV's `discriminator` keyword** to produce vastly better `oneOf` error messages when schemas use a discriminator property.

### Non-Goals

1. **Changing the public API** — `new Check(schema).test(data)` and `CheckError` must remain the same interface. No new methods, no renamed exports.

2. **Changing the error message format** — backtick-wrapped field names, period-terminated sentences, space-separated for multiple errors. The format is `` `field_name` problem_description. `` This is sacred.

3. **Adding features** like custom error messages, i18n, or error codes. This migration is purely about fixing the formatting engine.

4. **Optimizing performance** — AJV is already faster than `jsonschema`. We don't need to benchmark or optimize further.

5. **Changing consuming project code** — The migration should be achievable by bumping the `freeman-check` package version alone. Tests asserting the old broken messages will need updating (see Section 5.2 for categories of affected messages).

6. **Supporting JSON Schema drafts beyond what the current schemas use** — We use draft-07 features. AJV supports draft-07 natively with `ajv` (not `ajv/dist/2020`).

---

## 2. Current State Analysis

### The Package

`freeman-check` is a thin wrapper (~125 lines) around the `jsonschema` npm package, published to npm as `freeman-check`.

**Source structure:**
```
freeman-check/
├── src/
│   ├── Check.ts           # Main validation class (94 lines compiled)
│   ├── Check.test.ts      # Tests
│   ├── CheckError.ts      # Custom error class
│   ├── CheckError.test.ts # Tests
│   └── index.ts           # Barrel export
├── index.ts               # Root entry (re-exports from ./src)
├── package.json           # v3.0.6, deps: jsonschema, anora
└── tsconfig.json
```

### The Problem

The `Check.test()` method validates using `jsonschema`, then iterates over errors and formats them into human-readable English. A switch statement handles 5 error types by name:

| `error.name` | Subject Source | Problem Text | Quality |
|---|---|---|---|
| `additionalProperties` | `String(error.argument)` | `is not allowed` | ✅ Good |
| `required` | `String(error.argument)` | `is missing` | ✅ Good |
| `format` | `error.property.replace('instance.', '')` | `needs to be formatted as \`{arg}\`` | ✅ Good |
| `type` | `error.property.replace('instance.', '')` | `needs to be {a/an} \`{type}\`` | ✅ Good |
| `enum` | `error.property.replace('instance.', '')` | `needs to be [one of] "x", "y"` | ✅ Good |
| **default** | `String(error.argument)` | `is incorrect` | ❌ Broken |

The default case is the root cause of numerous production bugs. The `error.argument` field contains keyword-specific data that was never meant to be a field name — it could be a regex pattern, a number, `undefined`, or an array of subschema references.

### Bad Messages in Production

| Keyword | `error.argument` | Resulting Message |
|---|---|---|
| `oneOf` | `[subschema 0],[subschema 1],...` | `` `[subschema 0],[subschema 1],[subschema 2]` is incorrect `` |
| `pattern` | `^([01]\d\|2[0-3]):([0-5]\d)$` | `` `^([01]\d\|2[0-3]):([0-5]\d)$` is incorrect `` |
| `minimum` | `0` (the limit value) | `` `0` is incorrect `` |
| `maximum` | `100` | `` `100` is incorrect `` |
| `uniqueItems` | `undefined` | `` `undefined` is incorrect `` |
| `minLength` | `1` | `` `1` is incorrect `` |

---

## 3. Architecture

### 3.1 High-Level Design

Replace the `jsonschema` validation call and the error formatting switch statement with:

1. **AJV validation** — compile schema, validate data, collect all errors
2. **Error normalization** — convert AJV `ErrorObject[]` into a flat list of `{ fieldName, message }` tuples
3. **Message formatting** — convert each tuple into `` `fieldName` message. `` and concatenate

```
┌──────────────────────────────────────────────────────────┐
│                     Check.test(data)                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. AJV Validate                                         │
│     ┌─────────────────────────────────┐                  │
│     │ const validate = ajv.compile(s) │                  │
│     │ validate(data)                  │                  │
│     │ → ErrorObject[]                 │                  │
│     └──────────────┬──────────────────┘                  │
│                    │                                     │
│  2. Error Normalizer                                     │
│     ┌──────────────▼──────────────────┐                  │
│     │ normalizeErrors(errors, data)   │                  │
│     │ → { field: string,             │                  │
│     │     problem: string }[]        │                  │
│     └──────────────┬──────────────────┘                  │
│                    │                                     │
│  3. Message Formatter                                    │
│     ┌──────────────▼──────────────────┐                  │
│     │ formatMessages(normalized)      │                  │
│     │ → "`field` problem. `f2` p2."  │                  │
│     └──────────────┬──────────────────┘                  │
│                    │                                     │
│  4. Throw CheckError(message, schema, data)              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 AJV Instance Configuration

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  allErrors: true,        // collect ALL errors, not just the first
  discriminator: true,    // enable discriminator keyword for oneOf
  strict: false,          // don't fail on unknown keywords (backwards compat)
  messages: true,         // include default messages (useful for debugging)
  verbose: false,         // don't include schema/data in errors (performance)
});

addFormats(ajv);          // add "email", "uri", "date", "date-time", etc.
```

**Why these options:**
- `allErrors: true` — freeman-check currently reports ALL errors, not just the first. This must be preserved.
- `discriminator: true` — enables the `discriminator` keyword for `oneOf` schemas, producing dramatically better errors for discriminated unions.
- `strict: false` — some consuming project schemas may use non-standard keywords. Strict mode would throw at compile time.
- `addFormats` — the `jsonschema` package supports `format: "email"`, `format: "uri"`, etc. natively. AJV requires the `ajv-formats` plugin.

### 3.3 Schema Compilation and Caching

AJV compiles schemas into validation functions for performance. Since `Check` instances are often created per-request, we should cache compiled validators:

```typescript
class Check {
  private schema: Schema;
  private validate: ValidateFunction;

  constructor(schema: Schema) {
    if (!schema) throw new CheckError('Schema must be defined in constructor.');
    this.schema = schema;
    
    // AJV compiles the schema into a fast validation function.
    // If the same Check instance is reused, this only happens once.
    // For per-request usage, AJV's internal caching handles deduplication
    // when the same schema object reference is passed.
    this.validate = ajv.compile(schema);
  }

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
```

**Caching consideration:** AJV caches compiled validators internally by schema identity (object reference). If consuming code creates `new Check(schema)` per request with the same schema module export, we may want to add a module-level `Map<Schema, ValidateFunction>` cache keyed by schema reference to avoid redundant compilation. However, this is an optimization that can be deferred — correctness first.

### 3.4 File Structure (New)

```
freeman-check/
├── src/
│   ├── Check.ts              # Main class (refactored to use AJV)
│   ├── Check.test.ts         # Updated tests
│   ├── CheckError.ts         # UNCHANGED
│   ├── CheckError.test.ts    # UNCHANGED
│   ├── formatErrors.ts       # NEW: Error normalization + formatting engine
│   ├── formatErrors.test.ts  # NEW: Exhaustive formatting tests
│   ├── ajvInstance.ts         # NEW: Shared AJV instance with config
│   └── index.ts              # UNCHANGED (exports Check, CheckError, Schema)
├── index.ts
├── package.json              # Updated deps
└── tsconfig.json
```

### 3.5 Schema Type Export

Currently, `freeman-check` re-exports `Schema` from `jsonschema`. After migration, this type should come from AJV or be defined as a compatible type:

```typescript
// src/index.ts
import { Check } from './Check';
import { CheckError } from './CheckError';

// AJV uses JSONSchemaType or a plain object type.
// For backwards compatibility, we define Schema as a permissive type
// that accepts any valid JSON Schema object.
type Schema = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  // etc. — kept permissive for backwards compat
};

export { Check, CheckError, Schema };
```

Alternatively, use AJV's `SchemaObject` type directly, aliased as `Schema` for backwards compatibility.

---

## 4. Error Message Formatting Engine

### 4.1 Overview

The formatting engine is a pure function that takes AJV's `ErrorObject[]` and produces a single string. It has two stages:

1. **Normalize** — extract `fieldName` and `problem` from each `ErrorObject`
2. **Format** — assemble into `` `fieldName` problem. `` and concatenate

### 4.2 Field Name Extraction

AJV provides `instancePath` as a JSON Pointer (e.g., `/users/0/email`). The field name extraction rules are:

```typescript
function extractFieldName(error: ErrorObject): string {
  const { instancePath, keyword, params } = error;

  // For 'required', the missing field is in params, not instancePath
  if (keyword === 'required') {
    const parent = instancePath ? instancePath.slice(1).replace(/\//g, '.') : '';
    const field = (params as { missingProperty: string }).missingProperty;
    return parent ? `${parent}.${field}` : field;
  }

  // For 'additionalProperties', the extra field is in params
  if (keyword === 'additionalProperties') {
    const parent = instancePath ? instancePath.slice(1).replace(/\//g, '.') : '';
    const field = (params as { additionalProperty: string }).additionalProperty;
    return parent ? `${parent}.${field}` : field;
  }

  // For everything else, use instancePath
  if (!instancePath || instancePath === '') {
    return 'value';  // root-level validation failure
  }

  // Convert JSON Pointer to field name with BRACKET notation for array indices.
  // This is critical for backwards compatibility — jsonschema produces field[0],
  // not field.0. See Section 5.1.8 for the full list of affected test assertions.
  // /users/0/email → users[0].email
  // /tags/0 → tags[0]
  // /segments/0/type → segments[0].type
  return instancePath
    .slice(1)                      // Remove leading /
    .replace(/\/(\d+)/g, '[$1]')   // Convert /0 to [0] (array indices)
    .replace(/\//g, '.');           // Convert remaining / to . (object keys)
}
```

**Key difference from `jsonschema`:** The `jsonschema` package uses `error.property` (e.g., `instance.email`) and `error.argument` (e.g., `email`, `[subschema 0]`). AJV uses `instancePath` (e.g., `/email`) and `params` (keyword-specific structured data). This structured approach is what allows us to produce proper messages for every keyword.

### 4.3 Complete Keyword → Message Mapping

The formatting engine must handle every AJV keyword. Here is the complete mapping:

#### Preserved Keywords (backwards-compatible messages)

| AJV `keyword` | `params` | Field Name | Problem Text | Example Message |
|---|---|---|---|---|
| `additionalProperties` | `{ additionalProperty: "extra" }` | `params.additionalProperty` | `is not allowed` | `` `extra_field` is not allowed. `` |
| `required` | `{ missingProperty: "email" }` | `params.missingProperty` | `is missing` | `` `email` is missing. `` |
| `format` | `{ format: "email" }` | from `instancePath` | `` needs to be formatted as `{format}` `` | `` `email` needs to be formatted as `email`. `` |
| `type` | `{ type: "string" }` | from `instancePath` | `needs to be {a/an} \`{type}\`` | `` `tags` needs to be an `array`. `` |
| `enum` | `{ allowedValues: ["a","b"] }` | from `instancePath` | `needs to be [one of] "a", "b"` | `` `status` needs to be one of "active", "inactive". `` |

#### New Keywords (improved messages)

| AJV `keyword` | `params` | Problem Text | Example Message |
|---|---|---|---|
| `minimum` | `{ limit: 0, comparison: ">=" }` | `needs to be at least {limit}` | `` `age` needs to be at least 0. `` |
| `maximum` | `{ limit: 100, comparison: "<=" }` | `needs to be at most {limit}` | `` `quantity` needs to be at most 100. `` |
| `exclusiveMinimum` | `{ limit: 0, comparison: ">" }` | `needs to be greater than {limit}` | `` `amount` needs to be greater than 0. `` |
| `exclusiveMaximum` | `{ limit: 100, comparison: "<" }` | `needs to be less than {limit}` | `` `score` needs to be less than 100. `` |
| `multipleOf` | `{ multipleOf: 5 }` | `needs to be a multiple of {multipleOf}` | `` `quantity` needs to be a multiple of 5. `` |
| `minLength` | `{ limit: 1 }` | `needs to have at least {limit} character(s)` | `` `name` needs to have at least 1 character. `` |
| `maxLength` | `{ limit: 255 }` | `needs to have at most {limit} characters` | `` `bio` needs to have at most 255 characters. `` |
| `pattern` | `{ pattern: "^..." }` | `is not in the expected format` | `` `time` is not in the expected format. `` |
| `minItems` | `{ limit: 1 }` | `needs to have at least {limit} item(s)` | `` `tags` needs to have at least 1 item. `` |
| `maxItems` | `{ limit: 10 }` | `needs to have at most {limit} items` | `` `tags` needs to have at most 10 items. `` |
| `uniqueItems` | `{ i: 3, j: 1 }` | `must not have duplicate items` | `` `tags` must not have duplicate items. `` |
| `const` | `{ allowedValue: "fixed" }` | `needs to be {value}` | `` `type` needs to be "fixed". `` |
| `not` | `{}` | `must not match the excluded schema` | `` `field` must not match the excluded schema. `` |
| `oneOf` | `{ passingSchemas: null }` | `must match exactly one of the allowed schemas` | `` `event` must match exactly one of the allowed schemas. `` |
| `anyOf` | `{}` | `must match at least one of the allowed schemas` | `` `payload` must match at least one of the allowed schemas. `` |
| `if` | `{ failingKeyword: "then" }` | `does not satisfy the conditional requirement` | `` `value` does not satisfy the conditional requirement. `` |
| `contains` | `{ minContains: 1 }` | `must contain at least {min} matching item(s)` | `` `roles` must contain at least 1 matching item. `` |
| `propertyNames` | `{ propertyName: "bad!" }` | `has an invalid property name: "{name}"` | `` `config` has an invalid property name: "bad!". `` |
| `additionalItems` | `{ limit: 3 }` | `must not have more than {limit} items` | `` `tuple` must not have more than 3 items. `` |
| `dependencies` | `{ property: "a", deps: "b, c" }` | `has "{prop}" which requires "{deps}"` | `` `value` has "a" which requires "b, c". `` |
| `maxProperties` | `{ limit: 5 }` | `must not have more than {limit} properties` | `` `config` must not have more than 5 properties. `` |
| `minProperties` | `{ limit: 1 }` | `must have at least {limit} property/properties` | `` `config` must have at least 1 property. `` |
| `discriminator` | `{ error: "mapping", tag: "type", tagValue: "x" }` | `has an unrecognized "{tag}" value: "{tagValue}"` | `` `event` has an unrecognized "type" value: "unknown". `` |
| `discriminator` | `{ error: "tag", tag: "type", tagValue: 123 }` | `has a "{tag}" that is not a string` | `` `event` has a "type" that is not a string. `` |
| `false schema` | `{}` | `is not allowed` | `` `value` is not allowed. `` |
| **(fallback)** | any | `is invalid` | `` `field` is invalid. `` |

**Note on the fallback:** The new fallback `is invalid` replaces the old `is incorrect`. It's still generic, but it should rarely be reached since we now handle every standard keyword.

### 4.4 Singular vs. Plural

For count-based messages, use correct English:

```typescript
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// Usage:
// `needs to have at least 1 character` vs `needs to have at least 3 characters`
// `needs to have at least 1 item` vs `needs to have at least 2 items`
```

### 4.5 Handling `oneOf` Errors — The Critical Fix

This is the most important improvement. The `oneOf` keyword is the single largest source of broken error messages.

**Without discriminator:**

When `oneOf` fails, AJV reports the `oneOf` error plus child errors from each subschema that failed. With `allErrors: true`, you get a flood of errors. The strategy:

1. If a `oneOf` or `anyOf` error is present, **filter out** the child errors from the subschemas. Only report the parent `oneOf`/`anyOf` error.
2. The message is: `` `field` must match exactly one of the allowed schemas. ``

This is a dramatic improvement over `` `[subschema 0],[subschema 1],[subschema 2]` is incorrect ``.

**With discriminator:**

When the schema uses the `discriminator` keyword, AJV will:
- Report `discriminator` errors with `params.error = "mapping"` when the tag value doesn't match any subschema
- Report specific validation errors from the matched subschema when the tag value matches but the rest of the data is invalid

This means discriminated `oneOf` schemas will produce specific, helpful field-level errors instead of a generic "must match one of" message. No code changes needed — AJV handles this automatically when `discriminator: true` is set.

### 4.6 Error Deduplication and Filtering

AJV with `allErrors: true` can produce redundant or noisy errors, especially for `oneOf`/`anyOf`. The error normalizer must:

1. **Filter `oneOf`/`anyOf` child errors** — When a `oneOf` or `anyOf` error is present, discard errors whose `schemaPath` contains `/oneOf/` or `/anyOf/` subschema references (e.g., `#/oneOf/0/...`, `#/anyOf/1/...`), UNLESS the schema uses `discriminator` (in which case the child errors are specific to the matched subschema and should be kept).

2. **Deduplicate identical messages** — Multiple subschema failures can produce the same effective error. Deduplicate by `(fieldName, problem)` tuple.

3. **Preserve error order** — Errors should appear in the same order AJV reports them (roughly top-to-bottom, left-to-right through the data).

```typescript
function normalizeErrors(errors: ErrorObject[]): Array<{ field: string; problem: string }> {
  // Step 1: Identify if oneOf/anyOf parent errors exist
  const hasOneOfError = errors.some(e => e.keyword === 'oneOf');
  const hasAnyOfError = errors.some(e => e.keyword === 'anyOf');
  const hasDiscriminator = errors.some(e => e.keyword === 'discriminator');

  // Step 2: Filter out subschema noise (unless discriminator is in play)
  let filtered = errors;
  if ((hasOneOfError || hasAnyOfError) && !hasDiscriminator) {
    filtered = errors.filter(e => {
      // Keep the parent oneOf/anyOf error
      if (e.keyword === 'oneOf' || e.keyword === 'anyOf') return true;
      // Filter out errors from within oneOf/anyOf subschemas
      if (/\/(oneOf|anyOf)\/\d+\//.test(e.schemaPath)) return false;
      // Keep all other errors
      return true;
    });
  }

  // Step 3: Map to { field, problem } tuples
  const results = filtered.map(error => ({
    field: extractFieldName(error),
    problem: formatProblem(error),
  }));

  // Step 4: Deduplicate
  const seen = new Set<string>();
  return results.filter(({ field, problem }) => {
    const key = `${field}::${problem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```

### 4.7 The `formatProblem` Function

This is the core of the formatting engine — a switch on `error.keyword`:

```typescript
import anora from 'anora';

function formatProblem(error: ErrorObject): string {
  switch (error.keyword) {
    // === PRESERVED (backwards-compatible) ===
    
    case 'additionalProperties':
      return 'is not allowed';

    case 'required':
      return 'is missing';

    case 'format':
      return `needs to be formatted as \`${error.params.format}\``;

    case 'type': {
      const type = error.params.type;
      return `needs to be ${anora(type)} \`${type}\``;
    }

    case 'enum': {
      const values = error.params.allowedValues;
      const requirement = values.length === 1 ? 'needs to be' : 'needs to be one of';
      return `${requirement} ${values.map((s: unknown) => `"${s}"`).join(', ')}`;
    }

    // === NEW (improved messages) ===

    case 'minimum':
      return `needs to be at least ${error.params.limit}`;

    case 'maximum':
      return `needs to be at most ${error.params.limit}`;

    case 'exclusiveMinimum':
      return `needs to be greater than ${error.params.limit}`;

    case 'exclusiveMaximum':
      return `needs to be less than ${error.params.limit}`;

    case 'multipleOf':
      return `needs to be a multiple of ${error.params.multipleOf}`;

    case 'minLength': {
      const limit = error.params.limit;
      return `needs to have at least ${limit} ${pluralize(limit, 'character', 'characters')}`;
    }

    case 'maxLength':
      return `needs to have at most ${error.params.limit} characters`;

    case 'pattern':
      return 'is not in the expected format';

    case 'minItems': {
      const limit = error.params.limit;
      return `needs to have at least ${limit} ${pluralize(limit, 'item', 'items')}`;
    }

    case 'maxItems':
      return `needs to have at most ${error.params.limit} items`;

    case 'uniqueItems':
      return 'must not have duplicate items';

    case 'const': {
      const val = error.params.allowedValue;
      return typeof val === 'string' ? `needs to be "${val}"` : `needs to be ${JSON.stringify(val)}`;
    }

    case 'not':
      return 'must not match the excluded schema';

    case 'oneOf':
      return 'must match exactly one of the allowed schemas';

    case 'anyOf':
      return 'must match at least one of the allowed schemas';

    case 'if':
      return 'does not satisfy the conditional requirement';

    case 'contains': {
      const min = error.params.minContains ?? 1;
      return `must contain at least ${min} matching ${pluralize(min, 'item', 'items')}`;
    }

    case 'propertyNames':
      return `has an invalid property name: "${error.params.propertyName}"`;

    case 'additionalItems':
      return `must not have more than ${error.params.limit} items`;

    case 'dependencies': {
      const { property, deps } = error.params;
      return `has "${property}" which requires "${deps}"`;
    }

    case 'maxProperties':
      return `must not have more than ${error.params.limit} properties`;

    case 'minProperties': {
      const limit = error.params.limit;
      return `must have at least ${limit} ${pluralize(limit, 'property', 'properties')}`;
    }

    case 'discriminator': {
      const { error: discError, tag, tagValue } = error.params;
      if (discError === 'mapping') {
        return `has an unrecognized "${tag}" value: "${tagValue}"`;
      }
      return `has a "${tag}" that is not a string`;
    }

    case 'false schema':
      return 'is not allowed';

    default:
      return 'is invalid';
  }
}
```

### 4.8 The `formatMessage` Function

Assembles the final error string:

```typescript
function formatMessage(normalized: Array<{ field: string; problem: string }>): string {
  // Each error becomes: `field` problem.
  // Errors are concatenated with a space between them.
  // Final result has no trailing space.
  return normalized
    .map(({ field, problem }) => `\`${field}\` ${problem}.`)
    .join(' ');
}
```

This exactly preserves the current format: `` `field_name` problem. `field2` problem2. ``

---

## 5. Backwards Compatibility — Error Message Contract

This section defines the backwards-compatibility contract for every error message pattern. These patterns represent the API surface that consuming projects depend on.

### 5.1 Good Messages — MUST Be Preserved Byte-for-Byte

These messages are produced by the 5 currently-handled keywords (`required`, `additionalProperties`, `type`, `format`, `enum`). Every pattern below must continue to produce the exact same string after migration.

#### 5.1.1 Pattern: `` `{field}` is missing. ``

**Keyword:** `required`  
**Format:** `` `{field_name}` is missing. ``  
**Assertion method:** Exact string match (`.to.equal()`)

| Example Message |
|---|
| `` `email` is missing. `` |
| `` `name` is missing. `` |
| `` `parent.child` is missing. `` |
| `` `email` is missing. `wrong` is not allowed. `` |

**Compatibility rule:** The field name for `required` comes from `params.missingProperty` in AJV (equivalent to `error.argument` in jsonschema). Both produce the same leaf field name. ✅ No change needed.

#### 5.1.2 Pattern: `` `{field}` is not allowed. ``

**Keyword:** `additionalProperties`  
**Format:** `` `{field_name}` is not allowed. ``  
**Assertion method:** Exact string match

| Example Message |
|---|
| `` `extra_param` is not allowed. `` |
| `` `foo` is not allowed. `` |
| `` `UNKNOWN_FIELD` is not allowed. `` |
| `` `extraParam1` is not allowed. `extraParam2` is not allowed. `` |

**Compatibility rule:** The field name for `additionalProperties` comes from `params.additionalProperty` in AJV (equivalent to `error.argument` in jsonschema). Both produce the same property name. ✅ No change needed.

#### 5.1.3 Pattern: `` `{field}` needs to be a/an `{type}`. ``

**Keyword:** `type` (single type)  
**Format:** `` `{field_name}` needs to be {a|an} `{type}`. ``  
**Article rule:** `anora(type)` — "an" before vowel sounds (`array`, `object`, `integer`), "a" before consonants (`string`, `number`, `boolean`)  
**Assertion method:** Exact string match

| Type | Article | Example Message |
|---|---|---|
| `string` | a | `` `name` needs to be a `string`. `` |
| `number` | a | `` `count` needs to be a `number`. `` |
| `integer` | an | `` `count` needs to be an `integer`. `` |
| `boolean` | a | `` `enabled` needs to be a `boolean`. `` |
| `array` | an | `` `tags` needs to be an `array`. `` |
| `object` | an | `` `data` needs to be an `object`. `` |

**Compatibility rule:** AJV provides `error.params.type` as a string (e.g., `"string"`, `"array"`). For single types, this is identical to the current behavior. ✅ No change needed for single types.

#### 5.1.4 Pattern: `` `{field}` needs to be one of {values}. ``

**Keyword:** `enum` (multiple values)  
**Format:** `` `{field_name}` needs to be one of {quoted_comma_separated_values}. ``  
**Assertion method:** Exact string match

| Example Message |
|---|
| `` `status` needs to be one of "PENDING", "COMPLETED", "CANCELLED". `` |
| `` `type` needs to be one of "A", "B". `` |
| `` `rating.outcome` needs to be one of "GOOD", "BAD". `` |

**Compatibility rule:** AJV provides `error.params.allowedValues` as an array (equivalent to `error.argument` array in jsonschema). Formatting logic is identical. ✅ No change needed.

#### 5.1.5 Pattern: `` `{field}` needs to be "{value}". ``

**Keyword:** `enum` (single value)  
**Format:** `` `{field_name}` needs to be "{single_value}". ``  
**Assertion method:** Exact string match

| Example Message |
|---|
| `` `type` needs to be "NOTE". `` |

**Compatibility rule:** When `allowedValues.length === 1`, use `needs to be` instead of `needs to be one of`. ✅ No change needed.

#### 5.1.6 Pattern: `` `{field}` needs to be formatted as `{format}`. ``

**Keyword:** `format`  
**Format:** `` `{field_name}` needs to be formatted as `{format_name}`. ``  
**Assertion method:** Exact string match

| Format Name | Example Message |
|---|---|
| `email` | `` `email` needs to be formatted as `email`. `` |
| `date` | `` `date` needs to be formatted as `date`. `` |
| `uuid` | `` `upload_uuid` needs to be formatted as `uuid`. `` |

**Compatibility rule:** AJV provides `error.params.format` (equivalent to `error.argument` in jsonschema). ✅ No change needed.

#### 5.1.7 Pattern: Nested Object Field Names (dot notation)

**Keywords:** Various (`type`, `enum`, `format`)  
**Format:** `` `{parent}.{child}` {problem}. ``

| Example Message |
|---|
| `` `rating.outcome` needs to be one of "GOOD", "BAD". `` |
| `` `rating.feedback` needs to be a `string`. `` |
| `` `config.nested.value` needs to be a `boolean`. `` |

**Compatibility rule:** AJV `instancePath` uses `/parent/child` → converted to `parent.child` via `.slice(1).replace(/\//g, '.')`. Same result as jsonschema's `instance.parent.child` → `.replace('instance.', '')`. ✅ No change needed.

#### 5.1.8 Pattern: Array Index Field Names (bracket notation) ⚠️

**Keywords:** Various (`type`, `enum`)  
**Format:** `` `{array}[{index}]` {problem}. `` or `` `{array}[{index}].{property}` {problem}. ``

| Example Message |
|---|
| `` `items[1]` needs to be a `number`. `` |
| `` `items[0]` needs to be a `number`. `` |
| `` `segments[0].type` needs to be one of "ACTIVE", "INACTIVE". `` |

**⚠️ CRITICAL COMPATIBILITY CONCERN:**

The current `jsonschema` library uses `instance.array[0].field` for array item paths. After `.replace('instance.', '')`, this becomes `array[0].field` (bracket notation).

AJV uses `/array/0/field` as `instancePath`. A naïve `.slice(1).replace(/\//g, '.')` converts this to `array.0.field` (dot notation) — **which breaks test assertions**.

**Required mitigation:** The `extractFieldName` function MUST convert array indices back to bracket notation to preserve backwards compatibility:

```typescript
function instancePathToFieldName(instancePath: string): string {
  if (!instancePath || instancePath === '') return 'value';
  
  // Convert /array/0/field → array[0].field (preserving bracket notation)
  return instancePath
    .slice(1)                    // Remove leading /
    .replace(/\/(\d+)/g, '[$1]') // Convert /0 to [0]
    .replace(/\//g, '.');        // Convert remaining / to .
}
```

This produces:
- `/member_ids/1` → `member_ids[1]` ✅
- `/segments/0/type` → `segments[0].type` ✅
- `/users/0/email` → `users[0].email` ✅
- `/rating/outcome` → `rating.outcome` ✅

#### 5.1.9 Pattern: Multiple Errors Concatenated

**Format:** `` `{f1}` {p1}. `{f2}` {p2}. ``

| Example Message |
|---|
| `` `email` is missing. `wrong` is not allowed. `` |
| `` `phone_number` is missing. `country_code` is missing. `` |
| `` `first_name` is missing. `last_name` is missing. `` |
| `` `address` is missing. `postcode` is missing. `country` is missing. `` |

**Compatibility rule:** Error concatenation format is `{error1} {error2}` (space-separated, each ending with period). The `formatMessage` function must preserve this exact format. The error ORDER may differ between jsonschema and AJV — see section 5.3 for mitigation.

#### 5.1.10 Summary of Good Message Patterns

| Pattern | Keyword | Risk Level |
|---|---|---|
| `` `{f}` is missing. `` | `required` | ✅ None |
| `` `{f}` is not allowed. `` | `additionalProperties` | ✅ None |
| `` `{f}` needs to be {a/an} `{type}`. `` | `type` (single) | ✅ None |
| `` `{f}` needs to be one of {values}. `` | `enum` (multi) | ✅ None |
| `` `{f}` needs to be "{value}". `` | `enum` (single) | ✅ None |
| `` `{f}` needs to be formatted as `{fmt}`. `` | `format` | ✅ None |
| Nested dot-notation fields | various | ✅ None |
| Array bracket-notation fields | various | ⚠️ Requires bracket-notation preservation |
| Multi-error concatenation | various | ⚠️ Requires error ordering match |

### 5.2 Bad Messages — Will Intentionally Change

These are messages produced by either (a) the broken default case (`is incorrect`), (b) broken union type formatting, or (c) the `instance` prefix bug. All of these will produce better messages after migration. Tests asserting them must be updated in consuming projects.

#### 5.2.1 Default Case: `is incorrect` Messages

These messages all come from keywords that fall through to the `default` case in the current switch statement, where `String(error.argument)` is used as the field name and `is incorrect` is the problem text.

##### oneOf Subschema Errors

| Current Bad Message | New Message |
|---|---|
| `` `[subschema 0],[subschema 1],[subschema 2]` is incorrect. `` | `` `value` must match exactly one of the allowed schemas. `` (or discriminator-specific errors) |

##### uniqueItems Errors

| Current Bad Message | New Message |
|---|---|
| `` `undefined` is incorrect. `` | `` `{field}` must not have duplicate items. `` |

##### pattern Errors — Regex Leaking

| Current Bad Message | New Message |
|---|---|
| `` `^([01]\d\|2[0-3]):([0-5]\d)$` is incorrect. `` | `` `{field}` is not in the expected format. `` |

##### minimum Errors

| Current Bad Message | New Message |
|---|---|
| `` `0` is incorrect. `` | `` `{field}` needs to be at least 0. `` |

##### minLength / minItems Errors

| Current Bad Message | New Message |
|---|---|
| `` `1` is incorrect. `` | `` `{field}` needs to have at least 1 character. `` (for `minLength`) or `` `{field}` needs to have at least 1 item. `` (for `minItems`) |

##### Other Numeric Constraint Errors

| Current Bad Message | New Message |
|---|---|
| `` `2` is incorrect. `` | `` `{field}` needs to have at least 2 characters. `` |
| `` `100` is incorrect. `` | `` `{field}` needs to be at most 100. `` |
| `` `365` is incorrect. `` | `` `{field}` needs to be at most 365. `` |

##### Broken Enum-like Errors

| Current Bad Message | New Message |
|---|---|
| `` `"Value1","Value2","Value3"` is incorrect. `` | Schema-dependent — likely `` `{field}` must match exactly one of the allowed schemas. `` or `` `{field}` needs to be one of {values}. `` |

#### 5.2.2 Broken Union Type Messages

These are produced by the current `type` keyword handler when the schema uses `type: ["string", "null"]` or similar union types. The current `jsonschema` code falls through to `JSON.stringify(error.schema.type)` → `["string","null"]`, producing ugly bracket-and-quote formatting.

| Current Bad Message | New Message |
|---|---|
| `` `{field}` needs to be a `["number","null"]`. `` | `` `{field}` needs to be a `number` or `null`. `` |
| `` `{field}` needs to be a `["string","null"]`. `` | `` `{field}` needs to be a `string` or `null`. `` |
| `` `{field}` needs to be a `["array","null"]`. `` | `` `{field}` needs to be an `array` or `null`. `` |
| `` `{field}` needs to be a `["string","number"]`. `` | `` `{field}` needs to be a `string` or a `number`. `` |

#### 5.2.3 Broken `instance` Prefix Messages

These are caused by the `instance.` → `` simple string replace in jsonschema error handling. When the property path uses bracket notation (e.g., `instance[0].field` or `instance["field with spaces"]`), the `.replace('instance.', '')` fails to strip the prefix.

| Current Bad Message | New Message |
|---|---|
| `` `instance["Field Name"]` needs to be a `number`. `` | `` `Field Name` needs to be a `number`. `` |
| `` `instance["dotted.key"]` needs to be one of {values}. `` | `` `dotted.key` needs to be one of {values}. `` |
| `` `instance[0].field` needs to be an `array`. `` | `` `[0].field` needs to be an `array`. `` |

**Note:** AJV uses `instancePath` as a proper JSON Pointer, so it naturally avoids the `instance` prefix bug entirely. These will be fixed automatically.

#### 5.2.4 Summary of Bad Message Categories

| Category | Description |
|---|---|
| `[subschema]` is incorrect (oneOf) | `oneOf` keyword falling through to broken default case |
| `undefined` is incorrect (uniqueItems) | `uniqueItems` keyword producing `undefined` as field name |
| Regex `is incorrect` (pattern) | `pattern` keyword leaking raw regex as field name |
| Numeric `is incorrect` (minimum/maximum/etc.) | Numeric constraint keywords using limit value as field name |
| Broken enum-like is incorrect | `oneOf`-based enums producing comma-separated values as field name |
| Union type formatting | `type` keyword producing raw JSON array syntax for union types |
| `instance` prefix bug | String replace failing on bracket-notation paths |

### 5.3 Error Ordering Compatibility

`jsonschema` and AJV may report errors in different orders. Some consuming project tests assert the exact order of multiple errors in a single message.

**Current behavior (jsonschema):** Errors are reported in schema traversal order — roughly: `additionalProperties` and `required` errors first (from schema-level keywords), then property-level errors (`type`, `format`, `enum`) in property definition order.

**AJV behavior:** With `allErrors: true`, errors are reported in data/schema traversal order. The typical order is:
1. Property-level errors (for each property in the data, in data order)
2. `additionalProperties` errors
3. `required` errors (for missing properties)

**Mitigation strategy:**

If multi-error tests fail due to ordering, implement a sort in `normalizeErrors` that matches jsonschema's ordering:
1. `required` errors first (sorted alphabetically by field name)
2. `additionalProperties` errors second (sorted alphabetically)
3. All other errors (sorted by `instancePath` depth, then alphabetically)

This should only be implemented if ordering mismatches actually cause test failures. Start without sorting and observe.

### 5.4 Field Name Mapping: `jsonschema` → AJV

| Scenario | `jsonschema` (`error.property`) | AJV (`error.instancePath`) | Extracted Field Name |
|---|---|---|---|
| Root property `email` | `instance.email` | `/email` | `email` |
| Nested `event.type` | `instance.event.type` | `/event/type` | `event.type` |
| Array item `tags[0]` | `instance.tags[0]` | `/tags/0` | `tags[0]` ⚠️ |
| Array item nested `tags[0].name` | `instance.tags[0].name` | `/tags/0/name` | `tags[0].name` ⚠️ |
| Root missing required `email` | `instance` (arg: `email`) | `` (params: `{missingProperty:"email"}`) | `email` |
| Nested missing required `event.type` | `instance.event` (arg: `type`) | `/event` (params: `{missingProperty:"type"}`) | `event.type` |
| Root additional property `extra` | (arg: `extra`) | `` (params: `{additionalProperty:"extra"}`) | `extra` |
| Root-level type failure | `instance` | `` | `value` |

⚠️ Array indices MUST use bracket notation (`[0]`) not dot notation (`.0`) — see section 5.1.8 for the required `instancePathToFieldName` implementation.

### 5.5 The `Schema` Type Export

Currently, `freeman-check` re-exports `Schema` from `jsonschema`. After migration, the `Schema` type should be defined as a compatible interface:

```typescript
import type { SchemaObject } from 'ajv';
export type Schema = SchemaObject;
```

This maintains the `Schema` export without breaking any imports.

### 5.6 Compatibility Test Suite for freeman-check

To guarantee that the AJV migration does not break consuming projects, `freeman-check@4.0.0` MUST include a dedicated compatibility test suite that asserts every message pattern from this catalogue. This suite should be organized as follows:

```typescript
describe('backwards compatibility', () => {

  describe('required — `field` is missing', () => {
    it('should produce `email` is missing for a missing required field');
    it('should produce `nested.field` is missing for nested required fields');
    it('should produce `parent.child` is missing for deeply nested required fields');
  });

  describe('additionalProperties — `field` is not allowed', () => {
    it('should produce `extra` is not allowed for an unexpected property');
    it('should produce `parent.extra` is not allowed for nested extra properties');
  });

  describe('type (single) — `field` needs to be a/an `type`', () => {
    it('should use "a" for string, number, boolean');
    it('should use "an" for array, object, integer');
    it('should handle nested field paths with dot notation');
  });

  describe('type (union) — `field` needs to be a `type` or `type`', () => {
    it('should format ["string","null"] as a `string` or `null`');
    it('should format ["number","null"] as a `number` or `null`');
    it('should format ["array","null"] as an `array` or `null`');
    it('should format ["string","number"] as a `string` or a `number`');
  });

  describe('enum (multiple) — `field` needs to be one of "values"', () => {
    it('should quote each value and comma-separate');
    it('should handle long enum lists');
  });

  describe('enum (single) — `field` needs to be "value"', () => {
    it('should use "needs to be" not "needs to be one of" for single values');
  });

  describe('format — `field` needs to be formatted as `format`', () => {
    it('should handle email, date, uuid, uri formats');
  });

  describe('array index field names', () => {
    it('should use bracket notation: field[0] not field.0');
    it('should handle nested: field[0].property');
    it('should handle multiple indices: field[0].sub[1]');
  });

  describe('multi-error messages', () => {
    it('should concatenate with space: `f1` p1. `f2` p2.');
    it('should handle mixed required + additionalProperties');
    it('should handle 3+ errors');
  });

  describe('edge cases', () => {
    it('should use `value` for root-level validation failures');
    it('should handle null input → "The first argument is null or undefined."');
    it('should handle undefined input → "The first argument is null or undefined."');
    it('should handle no-schema constructor → "Schema must be defined in constructor."');
  });

});
```

**This test suite represents ~40 tests** that directly encode the backwards-compatibility contract. If any of these tests fail, consuming project integrations WILL break.

---

## 6. New Error Messages

### 6.1 Concrete Examples for Every New Keyword

Below are examples of schemas and the messages they would produce:

#### `pattern` — Format validation

**Schema:** `{ type: "string", pattern: "^([01]\\d|2[0-3]):([0-5]\\d)$" }`  
**Input:** `"25:00"`  
**Old message:** `` `^([01]\d|2[0-3]):([0-5]\d)$` is incorrect. ``  
**New message:** `` `time` is not in the expected format. ``

The regex is intentionally hidden from the user. End users should never see raw regex patterns.

#### `minimum` — Lower bound validation

**Schema:** `{ type: "integer", minimum: 0 }`  
**Input:** `-1`  
**Old message:** `` `0` is incorrect. ``  
**New message:** `` `age` needs to be at least 0. ``

#### `maximum` — Upper bound validation

**Schema:** `{ type: "integer", maximum: 100 }`  
**Input:** `150`  
**Old message:** `` `100` is incorrect. ``  
**New message:** `` `quantity` needs to be at most 100. ``

#### `minLength` — Non-empty string

**Schema:** `{ type: "string", minLength: 1 }`  
**Input:** `""`  
**Old message:** `` `1` is incorrect. ``  
**New message:** `` `name` needs to have at least 1 character. ``

#### `maxLength` — Character limit

**Schema:** `{ type: "string", maxLength: 500 }`  
**Input:** `"x".repeat(501)`  
**Old message:** `` `500` is incorrect. ``  
**New message:** `` `bio` needs to have at most 500 characters. ``

#### `uniqueItems` — Duplicate detection

**Schema:** `{ type: "array", items: { type: "string" }, uniqueItems: true }`  
**Input:** `["a", "b", "a"]`  
**Old message:** `` `undefined` is incorrect. ``  
**New message:** `` `tags` must not have duplicate items. ``

#### `minItems` — Non-empty array

**Schema:** `{ type: "array", items: { type: "string" }, minItems: 1 }`  
**Input:** `[]`  
**Old message:** `` `1` is incorrect. ``  
**New message:** `` `items` needs to have at least 1 item. ``

#### `maxItems` — Array size limit

**Schema:** `{ type: "array", items: { type: "string" }, maxItems: 5 }`  
**Input:** `["a","b","c","d","e","f"]`  
**Old message:** `` `5` is incorrect. ``  
**New message:** `` `items` needs to have at most 5 items. ``

#### `const` — Fixed value

**Schema:** `{ const: "webhook" }`  
**Input:** `"something_else"`  
**Old message:** `` `webhook` is incorrect. ``  
**New message:** `` `type` needs to be "webhook". ``

#### `oneOf` — Without discriminator keyword

**Schema:**
```json
{
  "oneOf": [
    { "properties": { "type": { "const": "a" } }, "required": ["type"] },
    { "properties": { "type": { "const": "b" } }, "required": ["type"] },
    { "properties": { "type": { "const": "c" } }, "required": ["type"] }
  ]
}
```
**Input:** `{ "type": "unknown" }`  
**Old message:** `` `[subschema 0],[subschema 1],[subschema 2]` is incorrect. ``  
**New message:** `` `value` must match exactly one of the allowed schemas. ``

#### `oneOf` — With discriminator keyword

**Schema:**
```json
{
  "type": "object",
  "discriminator": { "propertyName": "type" },
  "required": ["type"],
  "oneOf": [
    { "properties": { "type": { "const": "a" }, "x": { "type": "number" } }, "required": ["type", "x"] },
    { "properties": { "type": { "const": "b" }, "y": { "type": "number" } }, "required": ["type", "y"] }
  ]
}
```
**Input:** `{ "type": "unknown" }`  
**New message:** `` `value` has an unrecognized "type" value: "unknown". ``

**Input:** `{ "type": "a" }` (missing required `x`)  
**New message:** `` `x` is missing. `` (errors from the matched subschema are reported directly!)

#### `anyOf` — Multiple valid shapes

**Schema:** `{ "anyOf": [{ "type": "string" }, { "type": "number" }] }`  
**Input:** `true`  
**Old message:** `` `string,number` is incorrect. ``  
**New message:** `` `value` must match at least one of the allowed schemas. ``

#### `not`

**Schema:** `{ "not": { "type": "string" } }`  
**Input:** `"hello"`  
**New message:** `` `value` must not match the excluded schema. ``

#### `if`/`then`/`else`

**Schema:**
```json
{
  "if": { "properties": { "type": { "const": "business" } } },
  "then": { "required": ["company_name"] }
}
```
**Input:** `{ "type": "business" }`  
**New message:** `` `company_name` is missing. `` (AJV reports the `then` subschema errors directly when the `if` matches)

Note: AJV also reports an `if` keyword error. The error normalizer should filter it out when more specific child errors exist.

#### `discriminator` — Tag errors

**Input:** `{ "type": 123 }` (tag must be a string)  
**New message:** `` `value` has a "type" that is not a string. ``

### 6.2 Root-Level Validation

When validation fails at the root level (no field name), use `value` as the field name:

**Schema:** `{ "type": "object" }`  
**Input:** `"not an object"`  
**Message:** `` `value` needs to be an `object`. ``

---

## 7. Testing Strategy

### 7.1 Test Structure Inside freeman-check

Tests should be organized in the existing test file pattern, with a new file for the formatting engine:

```
src/
├── Check.test.ts           # Updated: existing tests + new keyword tests
├── CheckError.test.ts      # UNCHANGED
├── formatErrors.test.ts    # NEW: unit tests for the formatting engine
└── ...
```

### 7.2 Test Categories

#### Category 1: Backwards Compatibility Tests (CRITICAL)

One test per existing error type, asserting the exact message string:

```typescript
describe('backwards compatibility', () => {
  it('should produce the same message for additionalProperties', () => {
    const check = new Check({
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    });
    expect(() => check.test({ name: 'test', extra_field: 'bad' }))
      .to.throw(CheckError, '`extra_field` is not allowed.');
  });

  it('should produce the same message for required', () => {
    const check = new Check({
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
    });
    expect(() => check.test({}))
      .to.throw(CheckError, '`email` is missing.');
  });

  it('should produce the same message for format (email)', () => {
    const check = new Check({
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
      required: ['email'],
    });
    expect(() => check.test({ email: 'not-an-email' }))
      .to.throw(CheckError, '`email` needs to be formatted as `email`.');
  });

  it('should produce the same message for type (array)', () => {
    const check = new Check({
      type: 'object',
      properties: { favourite_films: { type: 'array' } },
      required: ['favourite_films'],
    });
    expect(() => check.test({ favourite_films: 'not an array' }))
      .to.throw(CheckError, '`favourite_films` needs to be an `array`.');
  });

  it('should produce the same message for type (string)', () => {
    const check = new Check({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    expect(() => check.test({ name: 123 }))
      .to.throw(CheckError, '`name` needs to be a `string`.');
  });

  it('should produce the same message for enum (multiple values)', () => {
    const check = new Check({
      type: 'object',
      properties: { status: { type: 'string', enum: ['active', 'inactive', 'pending'] } },
      required: ['status'],
    });
    expect(() => check.test({ status: 'deleted' }))
      .to.throw(CheckError, '`status` needs to be one of "active", "inactive", "pending".');
  });

  it('should produce the same message for enum (single value)', () => {
    const check = new Check({
      type: 'object',
      properties: { primary: { type: 'string', enum: ['true'] } },
      required: ['primary'],
    });
    expect(() => check.test({ primary: 'false' }))
      .to.throw(CheckError, '`primary` needs to be "true".');
  });

  it('should produce the same message for multiple errors', () => {
    const check = new Check({
      type: 'object',
      properties: { email: { type: 'string' } },
      required: ['email'],
      additionalProperties: false,
    });
    expect(() => check.test({ extra: 'bad' }))
      .to.throw(CheckError);
    // Message should contain both errors (order may need verification)
  });
});
```

#### Category 2: New Keyword Tests

One test per new keyword, asserting the new message format:

```typescript
describe('new keyword handling', () => {
  describe('minimum', () => {
    it('should produce a helpful message for minimum', () => {
      const check = new Check({
        type: 'object',
        properties: { age: { type: 'integer', minimum: 0 } },
        required: ['age'],
      });
      expect(() => check.test({ age: -1 }))
        .to.throw(CheckError, '`age` needs to be at least 0.');
    });
  });

  describe('maximum', () => {
    it('should produce a helpful message for maximum', () => {
      const check = new Check({
        type: 'object',
        properties: { quantity: { type: 'integer', maximum: 100 } },
        required: ['quantity'],
      });
      expect(() => check.test({ quantity: 150 }))
        .to.throw(CheckError, '`quantity` needs to be at most 100.');
    });
  });

  describe('minLength', () => {
    it('should produce a helpful message for minLength', () => {
      const check = new Check({
        type: 'object',
        properties: { name: { type: 'string', minLength: 1 } },
        required: ['name'],
      });
      expect(() => check.test({ name: '' }))
        .to.throw(CheckError, '`name` needs to have at least 1 character.');
    });
  });

  describe('maxLength', () => {
    it('should produce a helpful message for maxLength', () => {
      const check = new Check({
        type: 'object',
        properties: { bio: { type: 'string', maxLength: 10 } },
        required: ['bio'],
      });
      expect(() => check.test({ bio: 'a very long string that exceeds the limit' }))
        .to.throw(CheckError, '`bio` needs to have at most 10 characters.');
    });
  });

  describe('pattern', () => {
    it('should hide the regex from users', () => {
      const check = new Check({
        type: 'object',
        properties: { time: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' } },
        required: ['time'],
      });
      expect(() => check.test({ time: '25:00' }))
        .to.throw(CheckError, '`time` is not in the expected format.');
    });
  });

  describe('uniqueItems', () => {
    it('should produce a helpful message for uniqueItems', () => {
      const check = new Check({
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' }, uniqueItems: true } },
        required: ['tags'],
      });
      expect(() => check.test({ tags: ['a', 'b', 'a'] }))
        .to.throw(CheckError, '`tags` must not have duplicate items.');
    });
  });

  describe('minItems', () => {
    it('should produce a helpful message for minItems', () => {
      const check = new Check({
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'string' }, minItems: 1 } },
        required: ['items'],
      });
      expect(() => check.test({ items: [] }))
        .to.throw(CheckError, '`items` needs to have at least 1 item.');
    });
  });

  describe('maxItems', () => {
    it('should produce a helpful message for maxItems', () => {
      const check = new Check({
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'string' }, maxItems: 2 } },
        required: ['items'],
      });
      expect(() => check.test({ items: ['a', 'b', 'c'] }))
        .to.throw(CheckError, '`items` needs to have at most 2 items.');
    });
  });

  describe('const', () => {
    it('should produce a helpful message for const', () => {
      const check = new Check({
        type: 'object',
        properties: { type: { const: 'webhook' } },
        required: ['type'],
      });
      expect(() => check.test({ type: 'other' }))
        .to.throw(CheckError, '`type` needs to be "webhook".');
    });
  });

  describe('oneOf (without discriminator)', () => {
    it('should produce a helpful message instead of subschema gibberish', () => {
      const check = new Check({
        oneOf: [
          { type: 'object', properties: { type: { const: 'a' } }, required: ['type'] },
          { type: 'object', properties: { type: { const: 'b' } }, required: ['type'] },
        ],
      });
      expect(() => check.test({ type: 'c' }))
        .to.throw(CheckError, '`value` must match exactly one of the allowed schemas.');
    });
  });

  describe('oneOf (with discriminator)', () => {
    it('should produce a specific message using discriminator', () => {
      const check = new Check({
        type: 'object',
        discriminator: { propertyName: 'type' },
        required: ['type'],
        oneOf: [
          { type: 'object', properties: { type: { const: 'a' }, x: { type: 'number' } }, required: ['type', 'x'] },
          { type: 'object', properties: { type: { const: 'b' }, y: { type: 'number' } }, required: ['type', 'y'] },
        ],
      });
      expect(() => check.test({ type: 'unknown' }))
        .to.throw(CheckError, '`value` has an unrecognized "type" value: "unknown".');
    });

    it('should produce field-level errors for the matched subschema', () => {
      const check = new Check({
        type: 'object',
        discriminator: { propertyName: 'type' },
        required: ['type'],
        oneOf: [
          { type: 'object', properties: { type: { const: 'a' }, x: { type: 'number' } }, required: ['type', 'x'] },
          { type: 'object', properties: { type: { const: 'b' }, y: { type: 'number' } }, required: ['type', 'y'] },
        ],
      });
      expect(() => check.test({ type: 'a' }))
        .to.throw(CheckError, '`x` is missing.');
    });
  });

  describe('anyOf', () => {
    it('should produce a helpful message for anyOf', () => {
      const check = new Check({
        type: 'object',
        properties: { value: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
        required: ['value'],
      });
      expect(() => check.test({ value: true }))
        .to.throw(CheckError, '`value` must match at least one of the allowed schemas.');
    });
  });
});
```

#### Category 3: Edge Case Tests

```typescript
describe('edge cases', () => {
  it('should handle nested object field names', () => {
    const check = new Check({
      type: 'object',
      properties: {
        event: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
          required: ['metadata'],
        },
      },
      required: ['event'],
    });
    expect(() => check.test({ event: { metadata: {} } }))
      .to.throw(CheckError, '`event.metadata.path` is missing.');
  });

  it('should handle array index field names', () => {
    const check = new Check({
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            properties: { email: { type: 'string', format: 'email' } },
            required: ['email'],
          },
        },
      },
      required: ['users'],
    });
    expect(() => check.test({ users: [{ email: 'bad' }] }))
      .to.throw(CheckError, '`users[0].email` needs to be formatted as `email`.');
  });

  it('should handle root-level type errors', () => {
    const check = new Check({ type: 'object' });
    expect(() => check.test('not an object'))
      .to.throw(CheckError, '`value` needs to be an `object`.');
  });

  it('should handle constructor with no schema', () => {
    expect(() => new Check(null as any))
      .to.throw(CheckError, 'Schema must be defined in constructor.');
  });

  it('should handle test with null', () => {
    const check = new Check({ type: 'object' });
    expect(() => check.test(null))
      .to.throw(CheckError, 'The first argument is null or undefined.');
  });

  it('should handle test with undefined', () => {
    const check = new Check({ type: 'object' });
    expect(() => check.test(undefined))
      .to.throw(CheckError, 'The first argument is null or undefined.');
  });

  it('should pass valid objects without throwing', () => {
    const check = new Check({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
    expect(() => check.test({ name: 'test' })).to.not.throw();
  });
});
```

#### Category 4: Unit Tests for formatErrors

```typescript
describe('formatErrors', () => {
  describe('extractFieldName', () => {
    // Test each keyword's field name extraction
  });

  describe('formatProblem', () => {
    // Test each keyword's problem text generation
  });

  describe('normalizeErrors', () => {
    // Test oneOf/anyOf filtering
    // Test deduplication
    // Test error ordering
  });

  describe('formatMessage', () => {
    // Test single error formatting
    // Test multiple error concatenation
    // Test special characters in field names
  });

  describe('pluralize', () => {
    // Test singular/plural for each count-based keyword
  });
});
```

### 7.3 Test Count Estimates

| Category | Test Count |
|---|---|
| Backwards compatibility (5 keywords × multiple scenarios) | ~15 |
| New keyword handling (15+ keywords × 1-3 scenarios) | ~30 |
| Edge cases (nested, arrays, root, null, undefined, etc.) | ~15 |
| formatErrors unit tests | ~25 |
| **Total** | **~85 tests** |

---

## 8. Migration Guide for Consuming Projects

### 8.1 General Upgrade Steps

1. **Update `package.json`** to use `freeman-check@4.0.0`
2. **Run your test suite** — expect tests asserting the 5 backwards-compatible patterns (Section 5.1) to pass. Tests asserting the broken messages (Section 5.2) will fail with improved messages.
3. **Update failing test assertions** to match the new, improved error messages. The categories in Section 5.2 map old messages to new ones.
4. **Verify all other tests pass** unchanged
5. **Check for error ordering mismatches** — if any multi-error tests fail due to different error order, see Section 5.3 for mitigation strategies

### 8.2 What Should NOT Change in Your Code

| Area | Expected Impact |
|---|---|
| Code calling `new Check(schema).test(data)` | **None** — API is identical |
| Code catching `CheckError` instances | **None** — `instanceof CheckError` still works; `error.message`, `error.schema` still exist |
| `Schema` type imports | **Minimal** — the `Schema` type is now sourced from AJV but remains structurally compatible |
| Schema definitions | **None** — all draft-07 schemas continue to work |

### 8.3 What WILL Change

1. **Error messages for previously-unhandled keywords** — These will change from unhelpful `is incorrect` messages to proper, descriptive messages. See Section 5.2 for the full catalogue.
2. **Union type error messages** — `type: ["string", "null"]` will produce `` needs to be a `string` or `null` `` instead of `` needs to be a `["string","null"]` ``.
3. **The `instance` prefix bug is fixed** — Fields that previously showed `instance["field"]` or `instance[0].field` will now show the clean field name.

### 8.4 Rollback Plan

If unexpected test failures arise:

1. Revert `package.json` to `freeman-check@3.x`
2. Run tests to confirm all pass
3. Investigate the mismatched messages and add backwards-compatibility handling to `freeman-check@4.0.x`
4. Re-attempt upgrade

---

## 9. Edge Cases

### 9.1 Nested Objects

AJV's `instancePath` uses JSON Pointers for nested fields:

- `/event/metadata/path` → `event.metadata.path`
- `/users/0/email` → `users[0].email`
- `/config/nested/deep/value` → `config.nested.deep.value`

For `required` errors on nested objects:
- `instancePath: /event`, `params.missingProperty: "metadata"` → field name: `event.metadata`

### 9.2 Arrays of Objects

When validating items in an array:
- `instancePath: /users/0/email`, keyword: `format` → `` `users[0].email` needs to be formatted as `email`. ``
- `instancePath: /users/0`, keyword: `required`, params: `{missingProperty: "email"}` → `` `users[0].email` is missing. ``

### 9.3 Deeply Nested `oneOf`

For a `oneOf` inside a nested property:
```json
{
  "type": "object",
  "properties": {
    "event": {
      "type": "object",
      "properties": {
        "payload": {
          "oneOf": [...]
        }
      }
    }
  }
}
```

AJV reports `instancePath: /event/payload`, keyword: `oneOf`. Message: `` `event.payload` must match exactly one of the allowed schemas. ``

The error filtering logic must scope correctly — only filter subschema errors that belong to THIS `oneOf`, not unrelated errors elsewhere in the schema.

### 9.4 Multiple Simultaneous Errors

When an object has multiple validation failures:
```json
{ "email": 123, "status": "invalid", "extra_field": true }
```
Against a schema requiring `email` as string format "email", `status` as enum, `additionalProperties: false`:

AJV with `allErrors: true` reports all errors. The message should be:
`` `email` needs to be a `string`. `status` needs to be one of "active", "inactive". `extra_field` is not allowed. ``

Order should follow the schema/data structure.

### 9.5 `oneOf` with Overlapping Subschemas

When `oneOf` has subschemas that partially match (data matches 0 or 2+ subschemas), AJV reports:
- `passingSchemas: null` — none matched
- `passingSchemas: [0, 2]` — multiple matched (indices of matching subschemas)

Both cases should produce the same message: `` `field` must match exactly one of the allowed schemas. ``

### 9.6 Empty String vs Missing Field

- `{ "name": "" }` with `minLength: 1` → `` `name` needs to have at least 1 character. ``
- `{}` with `required: ["name"]` → `` `name` is missing. ``

These are distinct errors and should not be confused.

### 9.7 Null Values with Nullable Schemas

Some schemas use `type: ["string", "null"]` for nullable fields. AJV handles this natively. If a non-null, non-string value is provided:

- AJV reports `type` error with `params.type: "string,null"`
- Message: `` `field` needs to be a `string` or `null`. ``

This is an improvement over the current behavior, where `jsonschema` reports it as `needs to be a \`["string","null"]\`` which is ugly.

### 9.8 `additionalProperties` with Nested Objects

AJV reports `additionalProperties` errors at the correct nesting level:
- Extra property on root: `instancePath: ""`, `params.additionalProperty: "extra"` → `` `extra` is not allowed. ``
- Extra property on nested object: `instancePath: "/event"`, `params.additionalProperty: "extra"` → `` `event.extra` is not allowed. ``

### 9.9 Boolean Schemas

AJV supports `true` and `false` as schemas. `false` rejects everything (keyword: `false schema`). This should produce `` `field` is not allowed. ``

### 9.10 `if`/`then`/`else` Error Filtering

When `if`/`then`/`else` is used, AJV reports:
1. An `if` keyword error (generic)
2. Errors from the `then` or `else` subschema (specific)

The error normalizer should filter out the generic `if` error when specific `then`/`else` errors are present, since the specific errors are more actionable.

```typescript
// In normalizeErrors:
const hasIfError = errors.some(e => e.keyword === 'if');
if (hasIfError) {
  const hasSpecificErrors = errors.some(e => 
    e.schemaPath.includes('/then/') || e.schemaPath.includes('/else/')
  );
  if (hasSpecificErrors) {
    filtered = filtered.filter(e => e.keyword !== 'if');
  }
}
```

---

## 10. Dependencies

### 10.1 Packages to Add

| Package | Version | Purpose |
|---|---|---|
| `ajv` | `^8.x` | Core JSON Schema validator (draft-07 support built-in) |
| `ajv-formats` | `^3.x` | Adds format validation ("email", "uri", "date", "date-time", "ipv4", etc.) |

### 10.2 Packages to Remove

| Package | Reason |
|---|---|
| `jsonschema` | Replaced by AJV |

### 10.3 Packages to Keep

| Package | Reason |
|---|---|
| `anora` | Still used for a/an article determination in `type` error messages |

### 10.4 Dev Dependencies

No changes to dev dependencies. Existing `mocha`, `chai`, `typescript`, `ts-node` setup remains.

### 10.5 Package Size Impact

| | `jsonschema` | `ajv` + `ajv-formats` |
|---|---|---|
| Install size | ~120 KB | ~350 KB |
| Bundle size (minified) | ~45 KB | ~120 KB |

AJV is larger but significantly faster. The size increase is acceptable for a server-side package.

### 10.6 Version Strategy

- **`freeman-check@4.0.0`** — major version bump because:
  - Error messages for ~15+ keywords will change (even though the changes are improvements)
  - The `Schema` type export source changes from `jsonschema` to a compatible AJV type
  - Any code depending on the exact text of the bad `is incorrect` messages will break
- The major version bump signals that consumers should expect test updates

---

## Appendix A: AJV Error Object Reference

Every AJV validation error has this shape:

```typescript
interface ErrorObject {
  keyword: string;        // "required", "type", "minimum", etc.
  instancePath: string;   // JSON Pointer to failing field: "/users/0/email"
  schemaPath: string;     // JSON Pointer to failing keyword: "#/properties/email/format"
  params: object;         // keyword-specific data (see Section 4.3)
  message?: string;       // AJV's default message (not used — we generate our own)
}
```

## Appendix B: jsonschema vs AJV Error Comparison

| Feature | `jsonschema` | AJV |
|---|---|---|
| Error identifier | `error.name` (string) | `error.keyword` (string) |
| Field location | `error.property` ("instance.email") | `error.instancePath` ("/email") |
| Keyword data | `error.argument` (any — inconsistent) | `error.params` (typed per keyword) |
| Schema reference | `error.schema` (full subschema) | `error.schemaPath` (JSON Pointer) |
| Performance | Interprets schema each time | Compiles to function (cached) |
| All errors | Always collects all | `allErrors: true` option |
| Format validation | Built-in | Requires `ajv-formats` plugin |
| `discriminator` | Not supported | Supported with option |
| TypeScript types | Basic | Full `DefinedError` discriminated union |
