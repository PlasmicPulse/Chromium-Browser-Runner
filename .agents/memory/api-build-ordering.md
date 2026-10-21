---
name: API build ordering
description: Prevent output-directory races between the managed API workflow and manual builds.
---

The managed API development workflow builds the server before starting it. Its build step removes the existing output directory first, so a separate build running at the same time can remove files just before the workflow starts the server.

**Why:** A concurrent manual build and workflow startup caused a `MODULE_NOT_FOUND` for the API entry point; a sequential managed restart succeeded.

**How to apply:** Use the managed API workflow restart as the build check, and do not run a standalone build concurrently with it.
