---
name: PostgreSQL timestamp pagination
description: Precision and TypeScript constraints for reliable streaming log pagination.
---

Preserve PostgreSQL timestamp precision in timestamp-based pagination cursors rather than round-tripping through JavaScript Date.

**Why:** PostgreSQL retains microseconds, whereas JavaScript Date retains only milliseconds. Truncating a cursor can skip records around page boundaries when many events occur in the same millisecond.

**How to apply:** Carry an exact database timestamp string alongside the displayed date, and use a deterministic secondary key for ties. Preserve both cursor components when changing export ordering.

Annotate cursor-loop query rows explicitly instead of deriving the result using TypeScript ReturnType on the overloaded PostgreSQL query method.

**Why:** Cursor updates can create circular inference through query parameters. The query method also has a callback overload returning void, so ReturnType does not reliably describe its asynchronous result.

**How to apply:** Use an explicit row-result shape or the library's generic asynchronous query-result type when an annotation is needed.
