---
name: Remote browser responsiveness
description: Keep rendering work out of the ordered input pipeline.
---

Remote browser input must not wait for screenshot capture. Coalesce only adjacent pending movement/scroll events, preserving click, key, and navigation ordering.

**Why:** The original design waited for a screenshot after every interaction, causing input to accumulate even when the network was fast. A low refresh rate also made otherwise completed actions look delayed.

**How to apply:** Keep screenshots asynchronous, allow only one capture in flight, and skip frames under socket backpressure rather than sending increasingly stale images. Preserve ordered input and profile persistence when changing the transport. Faster screenshots improve interaction but are not equivalent to full-rate video streaming.
