---
name: Consent-gated verification
description: Avoid overstating verification when automated previews stop at activity consent.
---

Treat a screenshot of the activity-consent screen as an app-startup check only, not verification of the pet, chat, or browser interactions behind it.

**Why:** The preview capture uses a fresh visitor context without consent. An interaction-check setup can also fail independently of the implementation; a passing build does not resolve that gap.

**How to apply:** Verify gated interactions in a deliberately isolated real-component check or an appropriately authorized test session. Keep test consent separate from the user's own browser and report uncompleted interaction checks accurately.
