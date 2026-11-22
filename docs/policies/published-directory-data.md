---
name: Published directory data
description: Distinguish schema publication from actual institution data availability.
---

Verify actual institution counts in the published database before saying the
live directory is populated. Development counts and successful schema
publication are not evidence of a completed production data import.

For this directory, do not say the import problem is fixed until the published
database contains the same reviewed source record set as preview and published
institution search/display have been tested.

**Why:** The user explicitly requires published-database testing. A published
directory had its tables but no institution rows while preview had imported data;
successful search requests therefore returned zero.

**How to apply:** Check production tables and row counts read-only, distinguish
empty data from filter exclusions and request failures, and report preview and
published results separately. Do not claim a source import merely because its
parser or schema exists.
