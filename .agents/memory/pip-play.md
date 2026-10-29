---
name: Pip play constraints
description: User intent and interaction constraints for Pip's rough-play toys and effects.
---

Pip's rough play is figurative. Pip must not be destructible, and tossing, impacts, and toy interactions must not reduce happiness or care stats. Do not add cartoon onomatopoeia text. Anime powers should feel like forceful, cinematic big moves rather than cartoonish effects.

**Why:** The user explicitly framed “DEMOLISH” as play, not actual destruction, requested no happiness decrease, rejected cartoon sound-effect text, and said anime powers should feel like big moves rather than cartoonish.

**How to apply:** Preserve these constraints when adding toys, impact feedback, or new physics behaviors. Keep special-move visuals cinematic and substantial without making Pip destructible or reducing care stats. Keep play-input capture opt-in with a clear exit so it does not interfere with remote browsing.

Keep particle work bounded and avoid large animated DOM particle collections.

**Why:** The user experienced wall-impact lag and values the browser's responsiveness.

**How to apply:** Prefer a capped canvas or a small number of simple graphics for new effects, and assess rapid repeated use, not just one isolated effect.
