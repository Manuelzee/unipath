---
name: Scorecard reporting years
description: Accurate reporting-year labels and API request size limits for College Scorecard imports.
---

Request year-qualified College Scorecard metrics and select each metric's latest non-null year, rather than assigning one reporting year to all `latest` fields.

**Why:** Tuition, admissions, completion, and aid measures can have different reporting years. The `latest` projection does not reliably identify each metric's year.

**How to apply:** Preserve each metric's year separately and display it beside its value. Split historical fields into small year ranges, merge responses by institution ID, and keep pagination ordering identical across batches. A request containing all historical fields exceeded the gateway URI limit (HTTP 414); five-year batches succeeded.
