# Problem

The validation engine behind `freeman-check` could only produce clear error messages for 5 types of validation failures. The remaining ~30 types — covering things like numeric limits, text patterns, array constraints, and union schemas — generated confusing messages. Users would see raw regular expressions, internal schema references, or simply the word "undefined" when their data didn't match expectations.

# Solution

We replaced the underlying validation engine with AJV, a modern and widely-used alternative. Every validation error now produces a clear, human-readable message — no leaked internals, no cryptic output.

Critically, the 5 original error types produce **byte-for-byte identical messages** to the previous version. This is a drop-in upgrade with no breaking changes to the public interface.

# How It Works

When data fails validation, the new engine translates each failure into a plain-English message tailored to what went wrong:

- **Pattern errors** no longer show raw regex — they simply say the value doesn't match the expected format
- **Numeric constraints** now explain themselves clearly (e.g., "needs to be at least 0") instead of confusing the limit value with a field name
- **Union schemas** produce helpful messages like "must match exactly one of the allowed schemas" instead of dumping internal references
- **Array constraints** explain what's wrong with the list (too many items, duplicates, etc.)
- When data almost matches one variant of a union schema, a smart heuristic identifies the closest match and shows the specific errors from that variant — so users know exactly what to fix
- Union types like "string or null" are now displayed readably, with proper Oxford comma formatting for three or more types

The public interface remains unchanged — same exports, same error class, same usage patterns. Consumers upgrading from 3.0.6 to 3.1.0 don't need to change anything.

This is backed by 294 tests covering every validation keyword, edge case, and interaction.

# Credits

- Nabs (Architect)
- JENA (Lead Developer)
