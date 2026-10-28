---
name: Owner administration and verification policy
description: Explicit owner authorization, review-before-apply, and honest environment-specific testing requirements.
---

Never promote the owner's existing account automatically, solely by email,
or through client-controlled settings. Use a securely identified account
and explicit owner authorization, with server-side permissions on every
administrative API. Student accounts remain separate and unprivileged.

**Why:** The user explicitly requires two-account live verification and
does not authorize an implicit privilege grant to their existing account.

**How to apply:** Preserve existing accounts, institutions, design, plans and
branding. Explain safe manual setup if the production identity is not yet
authorized; do not copy development identities or roles into production.

New verification changes require review before application. A URL or HTTP
success is not substantive verification. Keep authoritative source URLs
and real field-specific check dates, preserve last known good data on
failed attempts, and show missing/unsupported/conflicting/outdated evidence.

**Why:** The user requires truthful verification and no silent production
overwrites, including from background enrichment.

**How to apply:** Distinguish proposed evidence from accepted verification.
Check preview and production separately and report each requested test as
PASS, FAIL or NOT TESTED based on actual observations, not implementation
or source-code inspection alone.
