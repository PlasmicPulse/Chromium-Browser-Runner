---
name: Playwright deployment packaging
description: Browser binaries must survive publishing rather than living in an excluded cache.
---

Install and run Playwright with the same hermetic browser path (`PLAYWRIGHT_BROWSERS_PATH=0`) when packaging this app.

**Why:** Publishing excludes the workspace cache directory. A successful build can otherwise publish an app whose API starts normally but whose Chromium executable is missing. The old catch-all navigation message incorrectly made that failure look like a blocked destination.

**How to apply:** Keep the API build and all runtime entry points consistent. When public sites fail only after publishing, check an actual browser launch and its server logs, not just the health endpoint. Never relax destination protections to compensate for startup errors.
