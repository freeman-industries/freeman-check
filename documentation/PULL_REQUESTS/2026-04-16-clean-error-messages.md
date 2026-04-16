# Problem

Two edge cases produced confusing error messages: (1) invalid schemas surfaced raw AJV meta-schema errors repeated 8 times, and (2) schemas that disallow array items produced one "is not allowed" error per element instead of a single clear message.

# Solution

Schema compilation errors are now caught and deduplicated into clean, readable messages. Per-item false-schema errors are collapsed into a single message like "must not have any items."

# Credits

- Nabs (Architect)
- JENA (Lead Developer)
