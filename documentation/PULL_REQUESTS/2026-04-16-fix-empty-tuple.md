# Problem

Legacy schemas using `items: []` (an empty tuple array) caused a compile-time error when passed to AJV. The schema normalizer was converting `items: []` to `prefixItems: []`, which the 2020-12 meta-schema rejects because `prefixItems` requires at least one item.

# Solution

Added a length guard to the tuple normalization logic. When `items` is an empty array, we now skip setting `prefixItems` entirely (since an empty tuple prefix is a no-op) while still correctly converting `additionalItems` to `items`. This means legacy schemas with `items: []` now compile and validate correctly — empty arrays pass, and non-empty arrays are rejected as expected.

# How It Works

Schemas that previously crashed on construction now work seamlessly. An empty tuple declaration like `{ type: 'array', items: [] }` correctly enforces that the array must be empty.

# Credits

- Nabs (Architect)
- JENA (Lead Developer)
