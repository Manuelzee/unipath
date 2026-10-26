# UniPath AI official college directory

For the Canada pilot, global coverage, licensing restrictions and beginner next
steps, see [International directory](global-college-directory.md). The U.S.
instructions below remain available; no Scorecard upload is required to browse
the existing U.S. institutions or the Canadian pilot.

## Student-facing rules

- Do not display annual tuition, annual cost figures, or tuition budget controls.
- Preserve the existing homepage design and subscription plans.
- Use source-reported institution and program records, with stable NCES UnitIDs.
- Display the actual source and directory import date; never imply that an import date is a live verification of applications, programs, requirements, or funding.
- Missing program data, requirements, and aid links must be labeled unavailable, not generated.

## The two files the owner uploads

At https://collegescorecard.ed.gov/data/ download:

1. **Most Recent Institution-Level Data** (ZIP).
2. **Most Recent Data by Field of Study** (ZIP).

Keep the ZIPs intact and attach them in the Replit Agent chat upload form. The owner does not need to edit code, extract files, or create a database.

## Technical import procedure (handled by the agent)

Inspect actual archive filenames, headers, and official release dates first. Do not assume a field layout changed safely. Raw archives and normalized intermediate files belong in the ignored `generated-artifacts/` directory; uploaded originals can remain in `attached_assets/`.

Prepare the records (replace the placeholder paths with actual uploaded files):

```sh
python artifacts/api-server/src/scripts/prepareScorecardFiles.py \
  attached_assets/INSTITUTION.zip attached_assets/FIELD_OF_STUDY.zip \
  --output generated-artifacts/scorecard-prepared.json
```

Pass `--release-date YYYY-MM-DD` only when the official download identifies that release date. The parser deliberately excludes annual prices and most-recent mixed-year numeric statistics.

Apply the additive database schema to development if needed:

```sh
pnpm --filter @workspace/db run push
```

Import the union of the bundled official active IPEDS directory and active Scorecard institutions:

```sh
pnpm --filter @workspace/api-server run sync:directory \
  --scorecard-file ../../generated-artifacts/scorecard-prepared.json
```

No API key is needed for the file-based path. Imports are transactional and deduplicated by UnitID. The importer checks the persisted record count after writing. Then verify the search API, state coverage, pagination, program/degree filters, and institution detail pages before reporting success.

The API-based import remains available via `COLLEGE_SCORECARD_API_KEY`, but should not be repeatedly retried when the government rejects the key.

## Official admissions and financial aid pages

Nullable admissions, application, and financial aid URLs are stored separately from the institution homepage. The importer accepts source-supplied ADMINURL/ADMURL, APPLURL, and FAIDURL when present. These columns are not guaranteed to be present in Scorecard files. The IPEDS directory record format also supports these explicit link fields for a later full-source refresh.

Never derive a plausible `/admissions` or `/financial-aid` URL. If a direct link is absent, show the official homepage with a clear instruction to locate the relevant section. Federal StudentAid.gov guidance is labeled separately from school-specific funding.

## Publishing

Development schema and data are separate from production. Do not tell the owner that importing development data updated their published site. Apply schema through Replit's publish migration workflow; do not add startup DDL or manually push the production schema. Production data needs its own approved import process. Verify the published environment separately before claiming that its directory is available.
