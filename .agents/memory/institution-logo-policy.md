---
name: Institution logo source policy
description: Identity, image-permission and fallback rules for institution logos.
---

Use verified institution identity and image-reuse evidence, never similar names,
favicons, social-preview photos or generated logos. When evidence is missing,
use an institution-name placeholder and report unchecked coverage honestly.
Discovery failures must not demote an existing verified logo.

**Why:** The user explicitly requires official/authorized logos, accurate stable-ID
association, permission checks, preservation of correct logos, and no claim that
all schools have logos until checked.

**How to apply:** Automatic reuse is deliberately restricted to independently
identified public-domain/CC0 images. Other licensing or identity ambiguities need
review, not an assumption that publicly accessible means reusable. Preserve
source/permission evidence and distinguish preview counts from published counts.

Commons image downloads can return HTTP 429 even when the identity/image
metadata API succeeds. Treat this as a source cooldown, not proof a school has
no logo, and do not evade it using alternate endpoints or repeated downloads.

**Why:** A small real import hit the image host's limit after metadata requests
had succeeded. Partial verified results must remain available during the pause.
