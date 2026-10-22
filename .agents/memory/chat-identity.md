---
name: Chat display names are not identity
description: Preserve the distinction between user-chosen chat names and actual message ownership.
---

Chat names are unverified display names and can be duplicated. Do not infer ownership, authorization, or device identity from a name match.

**Why:** Visitors choose their own names without registering an account. Another browser can choose the same name, so matching names do not reliably identify the sender.

**How to apply:** Own-message bubble styling should reflect messages known to have been sent by the current browser, not every message with the same display name. Keep owner authorization separate from chat names.
