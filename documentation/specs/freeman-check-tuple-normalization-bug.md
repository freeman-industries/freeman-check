# Bug: Missing Tuple Schema Normalization in freeman-check v3.2.0

## Summary

freeman-check v3.2.0 silently fails to validate tuple schemas written in the legacy `items: [...]` form. Schemas appear to compile and run without errors, but tuple item constraints are not enforced — invalid data passes validation.

## Root Cause

freeman-check v3.2.0 uses Ajv2020 (JSON Schema 2020-12). In 2020-12, the tuple validation syntax changed:

| Draft-07 (old) | 2020-12 (new) |
|---|---|
| `items: [schemaA, schemaB]` | `prefixItems: [schemaA, schemaB]` |
| `additionalItems: false` | `items: false` |

When Ajv2020 encounters `items` set to an array, it silently ignores it — no compilation error, no runtime error. The `additionalItems` keyword is also silently ignored. The result is that tuple positions are completely unchecked.

## Impact

Any consumer passing schemas with the legacy `items: [...]` tuple syntax has **silently broken validation**. Data that should be rejected passes through. This was caught during integration testing in a downstream project.

## Expected Behavior

freeman-check should normalize legacy tuple schemas before compiling them with Ajv. Specifically:

1. If `items` is an array, move it to `prefixItems`.
2. Set `items` to the value of `additionalItems` (default to `false` if `additionalItems` is absent).
3. Remove `additionalItems`.

The normalization **must operate on a deep clone** of the input schema. Consumers read `schema.items` directly for introspection, so the original object must not be mutated.

## Suggested Fix

Add a recursive normalization step before `ajv.compile()`:

- Walk the full schema tree, descending into `properties`, `patternProperties`, `items`, `prefixItems`, `contains`, `oneOf`, `anyOf`, `allOf`, `not`, `if`, `then`, `else`, `dependentSchemas`, and any nested `properties`.
- At each node, apply the `items`/`additionalItems` → `prefixItems`/`items` conversion described above.
- Deep-clone the schema before walking so the original is preserved.

## Test Coverage Needed

- Tuple schema at the root level.
- Tuple schema nested inside `properties`.
- Tuple schema nested inside `oneOf` / `anyOf` / `allOf`.
- Tuple schema with explicit `additionalItems: true` vs. `additionalItems: false` vs. absent.
- Confirm the original schema object is not mutated after compilation.
- Confirm that schemas already using `prefixItems` are unaffected.
