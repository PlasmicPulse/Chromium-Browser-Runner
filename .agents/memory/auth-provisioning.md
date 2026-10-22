---
name: Authentication provisioning constraint
description: Managed Clerk provisioning rejects the imported project's archive-style title.
---

Managed Clerk provisioning rejected the project title `Chromium-Browser-Runner.zip` as an invalid application name because it “contains a URL.”

**Why:** The provisioning service derives the application name from the project title; the archive extension is interpreted as a domain.

**How to apply:** Ensure the project has been renamed without the `.zip` extension before retrying managed Clerk setup. Do not modify managed authentication credentials or substitute another provider to bypass this error.
