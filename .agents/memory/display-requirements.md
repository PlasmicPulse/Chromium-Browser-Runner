---
name: Browser display requirements
description: User requirements for fitting, maximizing, scrolling, and cursor behavior.
---

Fit page width and keep vertical scrolling; do not shrink an entire long page into one view or crop away its content. The normal (non-maximized) display must support vertical scrolling.

Maximize should fill the app's browser page and hide its search bar and surrounding controls. It must be in-page maximization, not F11 or native browser fullscreen.

Keep the user's normal mouse cursor rather than a crosshair.

**Why:** These are the user's explicit requirements for the remote-browser experience.

**How to apply:** Preserve these behaviors if the rendering or remote-control transport is replaced. Keep a clear way to restore the normal view.
