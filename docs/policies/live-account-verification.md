---
name: Live account verification
description: Distinguish development sign-in checks from authenticated checks against the published app.
---

Development and production keep their accounts in separate databases. An
account, session or sign-in code from development never works on the published
site, and a relative path on the development server is not a production target.

**Why:** Earlier development persistence tests (then using Clerk development
fixtures) passed without proving that live accounts worked. The same gap exists
with the built-in accounts: a passing local or integration test does not show
that the published sign-up, email delivery or Google redirect works.

**How to apply:** Do not reuse development accounts or cookies on the live site,
weaken authentication, or expose sign-in codes. If no authorized production
testing mechanism is available, use a separately authorized production test
account created through the normal published sign-up, with credentials handled
only through the secure secrets flow. Public page/API checks and production
read-only schema/count checks are useful but do not establish that the
authenticated live save/reload/recommendation journey passed. Report that
distinction explicitly.
