---
name: Clerk live verification
description: Distinguish development test sign-in from authenticated checks against the published app.
---

Check the testing tool's actual environment support before assuming a
programmatic Clerk fixture can authenticate to the published site. A relative
path on the development domain is not a production target.

**Why:** Clerk has separate development and production identity
stores. The available browser test sign-in supported the development domain
only, despite general testing guidance describing arbitrary test users.
Successful development persistence tests therefore did not verify live accounts.

**How to apply:** Check the current tool schema, since support may change.
Do not reuse a development ticket on the live site, weaken authentication,
or expose sign-in tickets. If no authorized production testing mechanism is
available, use a separately authorized production test account created through
normal published signup, with credentials handled only through the secure
secrets flow. Public page/API checks and production read-only schema/count
checks are useful but do not establish that the authenticated live
save/reload/recommendation journey passed. Report that distinction explicitly.
