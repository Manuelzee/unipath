# Verified admissions and funding facts

UniPath’s U.S. institution records and the Canada PSC pilot are separate from
school-specific admissions requirements and scholarships. At present, no
independently verified admissions, scholarship, or grant facts have been
imported. A missing fact means “not in the verified directory,” not “not
available.” Each school profile links to its official page when one is present;
the funding finder links to general official U.S. and Canadian sources.

## What can be imported

`apps/api/src/scripts/importVerifiedInstitutionFacts.ts` accepts a
curated JSON manifest for admissions and funding facts. It does not download,
scrape, summarize, or invent the facts. A person must review the official page
and the source’s current commercial-reuse terms before entering concise,
source-supported data. Every school must already have a stable institution ID
in the directory. Each fact retains the official page, source, source date,
licence/terms page, date independently checked, and database import date.

The importer refuses unreviewed sources, non-HTTPS links, facts attached to
unknown or inactive schools, stale review timestamps, duplicate records, invalid
GPA scales, and tuition/cost text. Admission facts must be clearly marked as
school-general or program-specific. Missing source criteria stay empty; the
finder never treats a blank as proof that everyone qualifies.

Only source facts with a direct verified school or government page, a recent
independent check, and a non-expired deadline (if one is reported) can appear
as potential matches. A result is a research lead, not an eligibility decision
or a promise of funding. A missing deadline is never presented as an open
application. Student finder inputs are submitted for one request only; they are
not included in database imports, saved to a profile, or sent to an external
service.

## Import workflow for a reviewed source manifest

This is an operator workflow, not a student upload feature. A manifest uses the
`unipath-verified-facts-v1` JSON format, with each source recording its official
terms URL, attribution, review date, permission for commercial reuse, and a
`facts` array. Each fact records the existing `institutionId`, `kind`
(`admissions` or `funding`), title, official source URL, direct official page,
source date, and an exact `lastVerifiedAt` timestamp. It can also include the
source-reported requirements and eligibility fields supported by the database.

After preparing and reviewing that source file, preview it first:

```sh
pnpm --filter @workspace/api-server run import:verified-facts -- path/to/manifest.json --dry-run
```

Only after the source’s commercial-reuse terms have actually been checked,
import the records into the **development** database:

```sh
pnpm --filter @workspace/api-server run import:verified-facts -- path/to/manifest.json --confirm-commercial-reuse-reviewed
```

The project currently has no such source manifest and no school-level
admissions/funding records to import. College Scorecard access alone does not
provide each school’s current admission requirements, scholarships, or
deadlines. Its values must not be used to fill those gaps. WHED, CICIC, and
EduCanada bulk/reuse restrictions also remain in force; their directories are
not imported by this script. Production is separate: schema changes reach production only through a reviewed
deployment that runs `pnpm db:push`, and this change has not modified production.
