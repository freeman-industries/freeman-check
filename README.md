# freeman-check

**Clean, human-readable validation errors from any JSON schema — built for LLMs, APIs, and humans.**

This is the best JSON schema validation library for use by LLMs.

## Why this exists

Raw JSON schema validators produce error messages full of JSON Pointers, regex patterns, subschema references, and internal data structures. They look like this:

```
must match pattern "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
```

```
must match exactly one schema in oneOf (matched schemas: #/oneOf/0, #/oneOf/2)
```

```
must NOT have fewer than 1 items (found: undefined)
```

These messages are useless for LLMs trying to self-correct, confusing for developers during debugging, and dangerous to expose to end users over an API.

**freeman-check** fixes this. It wraps [AJV](https://ajv.js.org/) — the industry-standard JSON schema validator — with an error formatting layer that automatically produces clean English sentences from any JSON schema. No regex patterns leak out. No JSON Pointers. No internal references. Just clear, actionable messages:

```
`email` is not in the expected format. `age` needs to be at least 0. `tags` must not have duplicate items.
```

## Install

```bash
npm install freeman-check
```

## Quick example

```typescript
import { Check, CheckError } from 'freeman-check';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 0 },
  },
  required: ['name', 'email', 'age'],
  additionalProperties: false,
};

const check = new Check(schema);

try {
  check.test({
    name: '',
    email: 'not-an-email',
    age: -5,
    role: 'admin',
  });
} catch (error) {
  if (error instanceof CheckError) {
    console.log(error.message);
  }
}
```

**freeman-check output:**

```
`name` needs to have at least 1 character. `email` needs to be formatted as `email`. `age` needs to be at least 0. `role` is not allowed.
```

**What a raw validator would produce:**

```
/name must NOT have fewer than 1 characters
/email must match format "email"
/age must be >= 0
must NOT have additional properties (additionalProperty: role)
```

## API

The API surface is intentionally tiny:

```typescript
import { Check, CheckError } from 'freeman-check';

// 1. Create a validator from any JSON schema
const check = new Check(schema);

// 2. Validate data — throws CheckError if invalid
check.test(data);
```

**`new Check(schema)`** — compiles a JSON schema into a reusable validator. The schema is compiled once via AJV, so repeated `.test()` calls are fast.

**`check.test(data)`** — validates `data` against the schema. If valid, returns `void`. If invalid, throws a `CheckError`.

**`CheckError`** — extends `Error` with:
- `message` — the formatted, human-readable error string
- `schema` — the schema that was used for validation
- `input` — the data that failed validation

## Error message examples

Here's what freeman-check produces compared to raw validator output:

| Keyword | Raw validator output | freeman-check output |
|---|---|---|
| `pattern` | `must match pattern "^[A-Z]{2,3}$"` | `is not in the expected format` |
| `oneOf` | `must match exactly one schema in oneOf` | `must match exactly one of the allowed schemas` |
| `minimum` | `must be >= 0` | `needs to be at least 0` |
| `uniqueItems` | `must NOT have duplicate items (items ## 2 and 4 are identical)` | `must not have duplicate items` |
| `type` (union) | `must be string,null` | `needs to be a \`string\` or \`null\`` |
| `required` | `must have required property 'email'` | `\`email\` is missing` |
| `format` | `must match format "date-time"` | `needs to be formatted as \`date-time\`` |
| `additionalProperties` | `must NOT have additional properties` | `\`fieldName\` is not allowed` |
| `minLength` | `must NOT have fewer than 1 characters` | `needs to have at least 1 character` |
| `enum` | `must be equal to one of the allowed values` | `needs to be one of "active", "inactive"` |

Every error follows the format `` `fieldName` problem description. `` — a consistent structure that's easy for LLMs to parse, developers to read, and end users to understand.

## Keyword coverage

freeman-check handles 30+ JSON schema keywords with dedicated formatters:

`additionalProperties` · `unevaluatedProperties` · `required` · `format` · `type` · `enum` · `const` · `minimum` · `maximum` · `exclusiveMinimum` · `exclusiveMaximum` · `multipleOf` · `minLength` · `maxLength` · `pattern` · `minItems` · `maxItems` · `uniqueItems` · `contains` · `not` · `oneOf` · `anyOf` · `if` · `propertyNames` · `additionalItems` · `unevaluatedItems` · `dependencies` · `dependentRequired` · `maxProperties` · `minProperties` · `discriminator`

For compound keywords like `oneOf` and `anyOf`, freeman-check uses a best-match algorithm to surface the most specific errors from the closest-matching subschema instead of a generic "didn't match" message.

Any unrecognized keyword gets a safe fallback: `` `fieldName` is invalid. ``

## Built on AJV

freeman-check is **not** a reimplementation of JSON schema validation. Under the hood, it uses [AJV](https://ajv.js.org/) (Another JSON Validator) — the most widely used JSON schema validator in the JavaScript ecosystem with over 300 million weekly downloads on npm.

AJV handles all the hard parts: schema compilation, validation logic, format checking, and spec compliance. freeman-check adds the formatting layer on top — translating AJV's machine-oriented error objects into clean, human-readable messages.

You get AJV's battle-tested validation engine with error messages that are actually useful.

## Use cases

- **LLM tool calling and structured output** — validate LLM responses against your schemas, and feed clean error messages back for self-correction
- **API request validation** — return meaningful 400 errors that help API consumers fix their requests without exposing schema internals
- **Form validation** — surface field-level error messages that make sense to end users
- **Config file validation** — give developers clear feedback when their configuration doesn't match the expected shape

## License

MIT
