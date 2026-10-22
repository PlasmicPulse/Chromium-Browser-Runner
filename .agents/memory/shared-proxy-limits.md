---
name: Shared proxy rate limits
description: Avoid throttling all visitors together when the application sees a proxy IP.
---

Do not assume Express `req.ip` is a unique visitor identity behind the shared service proxy.

**Why:** Concurrent requests from unrelated browser sessions collided with an IP-only chat cooldown during verification. A proxy address can be shared by many visitors.

**How to apply:** Scope per-visitor cooldowns to a validated identifier where available, while preserving a separate aggregate anti-abuse policy. Do not enable broad trust of arbitrary forwarding headers merely to obtain an apparent client IP.
