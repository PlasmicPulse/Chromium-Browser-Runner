---
name: Pip play constraints
description: User intent and interaction constraints for Pip's rough-play toys and effects.
---

Pip's rough play is figurative. Pip must not be destructible, and tossing, impacts, and toy interactions must not reduce happiness or care stats. Do not add cartoon onomatopoeia text.

**Why:** The user explicitly framed “DEMOLISH” as play, not actual destruction, requested no happiness decrease, and rejected cartoon sound-effect text.

**How to apply:** Preserve these constraints when adding toys, impact feedback, or new physics behaviors. Keep play-input capture opt-in with a clear exit so it does not interfere with remote browsing.

Keep particle work bounded and avoid large animated DOM particle collections.

**Why:** The user experienced wall-impact lag and values the browser's responsiveness.

**How to apply:** Prefer a capped canvas or a small number of simple graphics for new effects, and assess rapid repeated use, not just one isolated effect.
