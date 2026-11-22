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

## Files needed for College Scorecard enrichment

At https://collegescorecard.ed.gov/data/ download:

1. **Most Recent Institution-Level Data** (ZIP)—required for institution enrichment.
2. **Most Recent Data by Field of Study** (ZIP)—optional for institutions, needed for source-reported program enrichment.

The official download page checked on October 26, 2026 lists the October 15, 2026 release:

- `Most-Recent-Cohorts-Institution_10152026.zip`
- `Most-Recent-Cohorts-Field-of-Study_10152026.zip`

Use the current release links on that page if the filenames have changed.
The official links at that check were:

- https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip
- https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_10152026.zip

Keep the ZIPs intact and place them in the ignored `attached_assets/` folder at the repository root.

## Technical import procedure

Inspect actual archive filenames, headers, and official release dates first. Do not assume a field layout changed safely. Raw archives and normalized intermediate files belong in the ignored `generated-artifacts/` directory; uploaded originals can remain in `attached_assets/`.

Prepare the records (replace the placeholder paths with actual uploaded files):

```sh
python apps/api/src/scripts/prepareScorecardFiles.py \
  attached_assets/INSTITUTION.zip attached_assets/FIELD_OF_STUDY.zip \
  --output generated-artifacts/scorecard-prepared.json
```

Pass `--release-date YYYY-MM-DD` only when the official download identifies that release date. The parser deliberately excludes annual prices and most-recent mixed-year numeric statistics.

The institution ZIP can also be prepared on its own: omit the second positional
argument. CSVs are streamed directly from ZIPs; extraction into the workspace is
not required. Archives are selected by required column headers, not by guessing
the first CSV filename. Multi-year archives require `--institution-member` (and
`--program-member` if needed) to avoid importing an arbitrary historical year.
Input CSV decoding defaults to UTF-8 with BOM support; use `--encoding cp1252`
only for a source confirmed to use that encoding.

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

`--scorecard-file` accepts absolute paths or paths relative to the repository
root as well as the package working directory. The `--ipeds-only` path inserts
missing official IPEDS rows without overwriting existing Scorecard enrichment.

The API-based import remains available via `COLLEGE_SCORECARD_API_KEY`, but should not be repeatedly retried when the government rejects the key.

### Verified institution column mappings

| Official column | Import/database meaning |
| --- | --- |
| `UNITID` | Stable NCES identity; `nces-<UNITID>` primary key, `ipeds_id`, and matching `scorecard_id` on Scorecard enrichment |
| `INSTNM` | Institution `name`, never generated from an ID |
| `CITY`, `STABBR` | `city`, `state`; FM/MH/PW retain their own country codes |
| `CURROPER` | Only records reported as operating (`1`) are selected |
| `CONTROL` | `ownership`: 1 public, 2 private nonprofit, 3 private for-profit |
| `INSTURL` | Source-supplied official institution website, checked for valid HTTP(S) |
| `PREDDEG` | Source-reported predominant degree classification; not a complete program list |
| `ADMINURL`/`ADMURL`, `APPLURL`, `FAIDURL` | Separate direct links only if those columns are supplied |
| FOS `CIPCODE`, `CIPDESC`, `CREDDESC` | Source-listed field and credential attached by `UNITID`, deduplicated |

Annual price columns are not selected for file import or student display. Mixed-year
most-recent outcome numbers are not assigned invented reporting years.

### Import diagnosis

At the October 26, 2026 check, no Scorecard ZIP, extracted Scorecard CSV, or
prepared Scorecard JSON existed in the workspace. Only requirement text files
had been uploaded. A one-record API probe returned HTTP 403; no key was logged.
Those ZIPs had not been uploaded. The ZIP/CSV route remains independent of the
API key. Do not infer a government download outage merely from missing files.

The development directory had 6,174 records and no duplicate primary/NCES IDs.
The published database had the directory tables but zero institution rows.
Therefore live unfiltered zero results were caused by missing production data.
Filters for unimported U.S. majors, funding, applicant status or language can
also legitimately return zero in preview; removing them reveals existing rows.
Search-request errors are now displayed as errors, not as a zero-record count.

## Official admissions and financial aid pages

Nullable admissions, application, and financial aid URLs are stored separately from the institution homepage. The importer accepts source-supplied ADMINURL/ADMURL, APPLURL, and FAIDURL when present. These columns are not guaranteed to be present in Scorecard files. The IPEDS directory record format also supports these explicit link fields for a later full-source refresh.

Never derive a plausible `/admissions` or `/financial-aid` URL. If a direct link is absent, show the official homepage with a clear instruction to locate the relevant section. Federal StudentAid.gov guidance is labeled separately from school-specific funding.

## Publishing

On API startup, missing rows are inserted from a checksum-verified snapshot of
the two public directory tables, even if IPEDS is already present. The snapshot
contains **6,174 institutions and 5,573 program records**, matching the reviewed
preview data: 5,913 U.S., 258 Canadian pilot institutions/campuses, and one each
in FM, MH and PW. Canada is a limited PSC co-op/internship listing, not a full
national directory, recognition register or DLI dataset.

The insert is one transaction. Concurrent startup is serialized. Existing IDs
are checked for conflicting source identities, no rows are updated or deleted,
and existing enrichment and all account/student tables are untouched. Counts
are verified before commit. Repeated startup inserts zero rows when the source
records are already present. Partial directories receive only missing rows.
Foreign-key parents are inserted before program records. Failures roll back.

The small compressed public-data snapshot is included in the API bundle, not
read from ignored development output. It contains no account/session data.
The exporter reads only the two directory tables, validates source identities,
and refuses bundles above its small-data size limit. There are no startup
schema migrations, external downloads or substitute sample records.

The new code takes effect on the published website only after the owner
publishes it. `/api/universities/import-status` reports source snapshot coverage,
expected/present counts and its checksum; this is not itself proof of a publish
until requested from the actual published hostname.

Development schema and data are separate from production. Do not tell the owner that importing development data updated their production site. Apply schema changes to production with `pnpm db:push` against the production `DATABASE_URL` during a reviewed deployment; do not add startup DDL. Production data needs its own approved import process. Verify the published environment separately before claiming that its directory is available.

### Official IPEDS provenance and reporting year

The raw **HD2025** ZIP was downloaded from NCES's official Complete Data Files
link, as listed in its official data catalog:

- https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx
- https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip

Its reporting year is **2025–26 (provisional)**; this directory year is not the
reporting year for admissions, completions or financial-aid outcomes.
`verifyIpedsProvenance.py` compared the bundled JSON with the archive:
all 5,916 `CYACTIVE = 1` UnitIDs match exactly, as do institution names, cities,
states, sectors and supplied website URLs (allowing an added HTTP(S) prefix or
trailing slash). The original archive has 5,985 rows; 69 are not `CYACTIVE = 1`.
Checksums, catalog/source links, date and results are stored in
`src/data/ipeds-provenance.json`.

The initial bundle did not include NCES's separate optional admissions,
application or aid links. Their absence is not a claim those official pages
do not exist. No admissions requirements, application status, deadlines or
scholarships were inferred by the provenance comparison.

### Simple published-site checks

After deploying, use the production hostname, not a local development server,
and open `/discover`:

1. Clear all filters. For this snapshot, the expected total is **6,174**.
2. Select United States: **5,913**; select Canada: **258**.
3. Clear filters and search “Harvard”: a real result should appear.
4. Use Next/Previous pages and open an institution profile and its official link.
5. For Canada, inspect Fields of Study; available PSC program records should appear.
6. Confirm annual tuition/cost figures are absent. Missing source facts remain unknown.

The agent must also check production counts directly, stable-ID duplicates,
the published search/detail/pagination endpoints and import-status counts.
An unfiltered 0 is not a completed import. A 500/503 is a request failure, not
zero matching schools. Until these production checks pass, report the remaining
blocker and do not say the problem is fixed.
