# Institution branding

## What is verified separately

- Existing official/authorized logos keep their stable institution IDs, sources
  and image-permission checks. No correct verified logo is overwritten.
- Primary and secondary HEX colors require explicit official color roles and
  values. The importer never samples a logo, CSS/theme color or photo.
- A mascot name requires an official statement identifying a mascot, not a team
  nickname. A verified name does not establish permission to copy artwork.
- Campus and mascot images require both institution association and permitted
  image reuse, stored source/license/credit and an actual cached image.
- Missing values remain nullable. Profiles use UniPath defaults and the exact
  text “Mascot information unavailable” where no name is verified.

## Initial official source adapter

The University of Alabama adapter is keyed to NCES 100751 **and** its official
website, not a name search. It reads:

- https://brand.ua.edu/colors/ — Crimson Flame, primary palette `#9E1B32`;
  Pachyderm, secondary palette `#5F6A72`. Both are parsed from the live guide.
- https://www.ua.edu/about/traditions/ — explicitly identifies Big Al as a mascot.
- https://brand.ua.edu/marks-seals/ — Big Al artwork requires separate approval.
  No such artwork is copied by this adapter.

The adapter records the guide’s restrictions: no tints/shades; secondary color
is decorative only and no more than 20% of the design. The UI uses exact colors
sparingly and chooses black/white button text using WCAG contrast calculations.
Institutional styles are scoped to the profile, not navigation or subscriptions.

## Automated discovery for existing/new records

The general process visits the official domain with robots rules, HTTPS,
public-IP/DNS pinning, redirect/body/time bounds. It follows only a bounded set
of official brand/colors/traditions links. Automatic fact parsing accepts exact
institution JSON-LD or explicitly labelled primary/secondary HEX statements;
unknown site layouts are not guessed. Additional official-guide adapters can be
added by stable ID after checking source identity and semantics.

Campus discovery independently rechecks Wikidata’s NCES ID and official website
against the institution record, then reads the entity's photograph property,
not its logo. It rejects logo/seal/mascot/SVG candidates. Commons image metadata
must establish public domain/CC0 or a supported CC BY/CC BY-SA license with an
author credit and no extra restrictions. Attribution/source/license are visible
on the profile, with notice that images were resized and converted to WebP.
Official structured media requires an image-specific license and creator where
attribution is required; a website's general accessibility is not a license.

Source HTTP 429 pauses image requests across logo and branding workers. Do not
bypass the pause using other endpoints. Existing verified facts/images remain.
Both workers share a database lock and run conservatively: at most one logo
record and one branding record per ten-minute cycle while the API is running.
Autoscale can stop workers when idle; this is not a guaranteed always-on crawl.
Facts deferred by an image cooldown become due again after one hour; other
source errors retry after a day, completed checks after 30 days.

## Storage and publishing

The existing image-asset table is shared for metadata/content-hash deduplication;
it retains its legacy `institution_logo_assets` name. Image bytes stay in App
Storage. Campus images fit within 1280×720 WebP, mascots within the existing logo
image bounds, with transparency and aspect ratio preserved. SVGs/scripts,
unsupported formats, oversized downloads/pixel counts are rejected as appropriate.

All requested institution fields are additive. `logo_source_url` mirrors the
existing verified logo-source field without changing old URLs. Per-category
statuses, image licenses/credits/hashes and verification dates distinguish partial
branding from complete records. “Verified” overall requires logo, color pair,
mascot name, permitted mascot image and campus photo; otherwise branding remains partial.
`branding_last_verified_at` changes only on an actual verified category import,
not on a failed attempt. Application/admissions verification is unrelated.

Run a bounded import in development:

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/discoverInstitutionBranding.ts --limit 3
```

Optional `--id nces-100751 --recheck` rechecks a particular stable institution,
but never bypasses image-source cooldowns or overwrites already verified facts.
The CLI exports metadata-only `institution-branding-manifest.json`. Publish
applies the additive database schema; startup imports verified groups only when
that category is not already verified and institution ID/website still match.
No production DDL, fake institutions or fabricated branding are used.

## Beginner steps and checks

No new API key or file upload is required. After the preview checks pass, click
Publish/Republish. Then production must be checked separately:

- `/api/universities/branding-coverage` gives real category counts.
- Search and inspect The University of Alabama for official palette/Big Al facts.
- Check a school without verified branding for defaults and missing-data wording.
- Verify cached image responses/credits when permitted photos exist; report zero
  rather than importing a substitute if source access or rights block retrieval.
- Compare desktop/mobile layouts and ensure existing tabs, official links,
  saved schools, homepage and subscriptions remain unchanged.

No annual tuition or annual cost figures belong in student-facing branding.
