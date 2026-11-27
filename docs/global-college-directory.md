# International directory: coverage and next steps

## Worldwide universities and scholarships (since 2026-11-27)

**Universities.** About 24,500 universities and colleges in 158 countries come
from the [Research Organization Registry](https://ror.org/) (ROR), a public-domain
(CC0) register. At the owner's request, **African countries are excluded**. The
United States and its territories stay on NCES IPEDS, and Canadian schools already
in the PSC pilot are not added twice.

- What a ROR entry has: name, other names (searchable), city, region, country,
  website and a link to its ROR record. It has no programs, tuition, admissions,
  language or recognition, and the app shows those as unknown. ROR is not an
  accreditation register.
- The data ships as `apps/api/data/world/ror-education.json.gz`, checked against
  `apps/api/src/data/world-directory-manifest.json`. At start-up the API adds any
  missing entries in the background (`lib/worldDirectory.ts`) and never changes or
  removes existing rows. The first deploy writes about 25,000 rows.
- Selection rules (Africa, U.S., Canada duplicates, research units):
  `apps/api/src/lib/world/rules.ts`.
- To refresh from a newer ROR release: download the dump from
  <https://zenodo.org/communities/ror-data>, then run
  `pnpm --filter @workspace/api-server exec tsx src/scripts/prepareWorldDirectory.ts <dump.json> <v2.17> <YYYY-MM-DD> <10.5281/zenodo.N>`
  and commit both files. New entries are added on the next deploy.
- Recommendations: with a study country set, only schools in that country are
  scored (filtered in the database). Without one, ROR-only entries are left out,
  because they have nothing to match on.

**Scholarships and sponsorships.** `apps/api/src/data/scholarships.json` lists 40
well-known government, university, foundation and intergovernmental programmes
for study outside Africa (Chevening, Commonwealth, Fulbright, DAAD, Erasmus Mundus,
MEXT, GKS, Türkiye Scholarships, Australia Awards and others). Each entry has the
sponsor, study countries, levels, how the sponsor describes the funding, who can
apply, and the official page. **Amounts and deadlines are deliberately not copied**,
because they change every year.

- `linkCheckedAt` is the date the official page was opened and named the
  programme. It is null for sites that block automated checks (Clarendon, DAAD,
  China Scholarship Council); the page says so.
- University-specific awards (Rhodes, Clarendon, Gates Cambridge, Knight-Hennessy,
  ESOP, Schwarzman, Yenching, Pearson, UBC) link to directory ids, so they show on
  those universities' pages and count for the "listed funding or scholarships"
  filter. National awards show on every university in that country.
- Students find them at **/scholarships** and on each university's
  **Scholarships & Funding** tab. The unit tests reject malformed entries, http
  links, African study countries and links to schools that are not in the directory.
- Review the list at least yearly: open each official page, update or remove entries,
  and set `reviewedAt` and `linkCheckedAt`.

## For the app owner

**You do not need to upload a ZIP file or provide another API key for the Canada pilot.**
The technical setup and the first database import have been handled in this project's
development database. Use **Discover → Country → Canada** to see the imported
source-listed institutions/campuses. The coverage panel reads real database counts.

This is **not a complete Canadian directory**, nor confirmation that every listed
institution is still operating or that every listed program is currently offered.
The source contains historical/stale names, and has no general recognition,
DLI, location, language-of-instruction, school website or admissions data.
Those fields are honestly unavailable rather than guessed.

### What is already supported

- One PostgreSQL directory, ISO country codes, stable internal identifiers and pagination.
- Existing U.S. records and saved-school IDs are preserved.
- A source-limited Canadian co-op/internship dataset with source-reported programs.
- Search and filters for country, name, city, region, type, degree, field, language,
  applicant eligibility and source-reported funding. Filters only match known data;
  missing eligibility is not a rejection by the school.
- Overview, Fields of Study, Admissions, Scholarships & Funding and Official Links.
- Separate source snapshot dates, database import dates and independent verification
  dates. An import does **not** count as independent school verification.
- Source-linked admissions and funding records can be stored as actual facts when
  reliable, reusable information is available. There are **no imported Canadian
  admissions requirements, scholarship offers, deadlines, DLI numbers or instruction
  languages** in the pilot. General guidance links are not counted as scholarships.
- No annual tuition/cost figures in student-facing directory data or controls.

### What you need to do for wider Canadian coverage

1. No action is needed to browse the pilot in a local or development run of the app.
2. For a broader EduCanada or CICIC import, obtain **written permission for commercial
   storage, extraction and display** or an expressly licensed export/API. Ask the
   directory owner which fields may be stored, update frequency, attribution and
   redistribution limits. Buying access alone is not necessarily redistribution
   permission. Do not send account passwords or API credentials in chat.
3. Share the permitted data export and its licence/permission document through the
   chat's file-upload control. A later implementation can match source identifiers
   to existing records, enrich locations and links, and test the actual new coverage.
4. If permission is unavailable, use provincial/territorial government datasets with
   an appropriate open licence. Each must be checked for institution status, stable
   identities, campuses, field definitions, dates and reuse rights before import.

### Current source access restrictions

| Source | Current use in UniPath AI | Restriction/scope |
| --- | --- | --- |
| [NCES IPEDS](https://nces.ed.gov/ipeds/) | Existing U.S. institution import | Source-limited directory; U.S. program enrichment remains pending. |
| [Canada PSC open dataset](https://open.canada.ca/data/en/dataset/ab36a4ab-9b69-49b1-8be6-6faa3f0d0c67) | Canadian institution/campus and program pilot | Validated co-op/internship listings, **not** a complete recognition register or current-offering guarantee. |
| [EduCanada](https://www.educanada.ca/programs-programmes/index.aspx?lang=eng) | External reference and scholarship-search link | [Terms](https://www.educanada.ca/notices-avis.aspx?lang=eng) require written permission for commercial redistribution unless separately licensed. No directory copied. |
| [CICIC](https://www.cicic.ca/868/search_the_directory_of_educational_institutions_in_canada.canada) | External recognition/authorization lookup | [Terms](https://www.cicic.ca/1679/terms_of_use.canada) prohibit automated extraction and storing significant portions. No directory copied. |
| [IRCC DLI list](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/prepare/designated-learning-institutions-list.html) | External current-status lookup | No licensed bulk DLI import has been approved. DLI does not imply every program qualifies for a PGWP. |
| [WHED](https://www.whed.net/) | External global reference only | [Terms](https://www.whed.net/Terms_of_use.html) require IAU's prior consent to copy all/substantial portions. No WHED data imported; WHED does not cover every college. |

The PSC dataset explicitly uses the [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada),
which permits commercial reuse with attribution and excludes personal information.
**Contains information licensed under the Open Government Licence – Canada.**
No government, IAU, UNESCO or institution endorsement is implied.
Recheck terms before any new import because access policies can change.

## Phased worldwide expansion

1. **Canada pilot:** import and test the openly licensed PSC data. Treat all unsourced
   operational, recognition and DLI claims as unverified.
2. **Broader Canada:** obtain permitted EduCanada/CICIC data or vetted provincial
   open data, reconcile campuses and aliases, and verify coverage before changing
   any completeness label.
3. **Next country:** choose an official national register with permitted commercial
   reuse. Add its source policy, country code, identity mapping and tests before
   importing. Do not populate countries with invented sample schools.
4. **WHED:** only integrate after explicit permission covers storage and commercial
   presentation. Supplement with official national data for institution types WHED
   does not cover.

No additional national directories have been imported. Three individual records
already present in the NCES source belong to Micronesia, the Marshall Islands and
Palau; global search correctly uses their own country codes instead of labelling
them U.S. states. These are not national country imports or complete coverage.

## Development and published data are separate

The pilot is imported and tested in **development**. This does not establish
that the production site has these tables or records. Production schema changes are
applied with `pnpm db:push` during deployment; database **records are not assumed to copy over**.
Deployment and an approved production data import must be handled separately, with
the target database confirmed. No production migration script or startup DDL is added.

## Maintainer instructions

These commands are for maintainers; the owner is not expected to run them.
The raw CSV and prepared JSON are intentionally kept in ignored `generated-artifacts/`,
not bundled as a permanent copy of contacts or large generated output.

Current permitted source snapshot:

```
https://open.canada.ca/data/dataset/ab36a4ab-9b69-49b1-8be6-6faa3f0d0c67/resource/c5e45e15-95f9-47ba-a99a-8329555da1e5/download/cfppsc_coop02-bom-2026_09_01.csv
```

Download the chosen resource from the official dataset page, review its release
date and licence, then prepare and import:

```sh
python apps/api/src/scripts/prepareCanadaPsc.py \
  generated-artifacts/source-data/canada-psc.csv \
  --source-date 2026-09-01 --output generated-artifacts/canada-psc.json
pnpm --filter @workspace/api-server exec tsx src/scripts/importInternationalDirectory.ts \
  ../../generated-artifacts/canada-psc.json --dry-run
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server exec tsx src/scripts/importInternationalDirectory.ts \
  ../../generated-artifacts/canada-psc.json
python -m unittest discover -s apps/api/src/scripts/tests -p 'test_prepare_canada_psc.py'
```

The importer only permits the reviewed PSC source. A new source needs an explicit
policy review; merely labelling an arbitrary file "WHED" or "open" is rejected.
Imports are transactional, preserve all U.S. rows, and verify written school/program
counts. Refreshes only deactivate records belonging to the same Canadian source.
The NCES/Scorecard sync's deactivation is scoped to its NCES identity namespace,
not unrelated international-source records.

The source has no official institution IDs. Canada uses source-qualified stable
internal identities derived from normalized institution labels, with an audited
alias map to preserve identities on known name variants/renames. These are **not**
presented as official government codes. Source-listed campuses stay separate unless
an authoritative identity match justifies merging. Cross-source identity matching
must be reviewed before adding another source for the same country.

One bilingual institution alias is merged; an ambiguous subject label in the
institution column is quarantined rather than published as a school. Duplicate
program cross-listings aggregate their source fields of study. Names and emails
of source contacts are excluded entirely. English/French labels do **not** establish
language of instruction.
