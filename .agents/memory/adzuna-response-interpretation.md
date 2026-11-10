---
name: Adzuna response interpretation
description: Avoid inferring successful authentication or a single cause from differing upstream error statuses.
---

Adzuna has returned both `AUTH_FAIL` HTTP 401 and HTTP 503 during the same
credential investigation. A 503 alone is not evidence that authentication
passed, and does not establish the internal cause of the failure.

**Why:** Earlier direct and browser tests showed different upstream statuses,
which could otherwise be mistaken for proof of a frontend-only problem or
valid credentials.

**How to apply:** Compare a minimal official request and the application's
request with the same credentials. Keep authentication, malformed local
configuration, and availability failures separate. Record safe statuses and
allowlisted error codes, never credential values or credential-bearing URLs.
Do not claim live search or tracker-save verification without authentic
listings returned by the provider.
