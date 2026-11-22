# Institution logos

The app never matches logo images by a similar institution name, generates
fake logos, or treats social-preview photos/favicons as verified brand logos.

## Identity and permission checks

- For U.S./NCES institutions, Wikidata's `P1771` must exactly match the NCES ID,
  and `P856` must match the official institution website's host **and path**.
  Exactly one matching entity/logo is required; ambiguity means review.
- Wikidata metadata is CC0. The image is independently checked using Wikimedia
  Commons' image metadata. Automatic reuse is restricted to images explicitly
  marked public domain/CC0, not copyrighted, and not attribution-required.
  Other licenses or unclear permissions require review; they are not rendered.
- An alternative works internationally: an institution's official HTTPS
  homepage must contain Organization/CollegeOrUniversity JSON-LD with its exact
  name and an explicit `logo` ImageObject, same-origin URL, and an image-specific
  CC0/public-domain-mark license. A page license does not license its logo.
- Official-site robots rules and HTTP access restrictions are respected. The
  process does not bypass access controls. HTTP 429 stops a batch.
  A one-hour shared-source cooldown is recorded in the directory diagnostics
  and carried in the published manifest; no further batch requests run during it.
- A verified identity/permission check is not a trademark license, endorsement,
  admissions verification, accreditation finding, or national coverage claim.
  Institutions without trustworthy official websites cannot be checked by name.
  This currently affects the source-limited Canadian PSC pilot.

## Data, cache and safety

Institution fields record the original logo URL, image source page, identity
evidence, license, status, last check, safe diagnostic and content hash. Images
live in App Storage, not the database or Git. Asset rows hold only metadata.
Images are resized inside 512×256 without cropping, converted to transparent
WebP where appropriate, stripped of source metadata, and content-deduplicated.
Broken images fall back to an accessible institution-name placeholder.

Fetches allow HTTPS/public IPs only, pin validated DNS addresses, check redirects,
bound body sizes/timeouts and reject scripts, unsafe SVG references/entities,
unsupported image formats and excessive decoded pixels.

## Automatic and repeatable imports

The API runs a bounded batch of one due institution after startup and every
ten minutes while it is running. A database advisory lock prevents multiple
autoscale instances from running background batches together. Verified/negative
results are due after 30 days; transient errors are due after one day. Autoscale
can pause processing when idle; this is not an always-running crawl or a promise
that all schools have been checked. Images with unclear rights stay placeholders.
The packaged identity catalog is refreshed after seven days, then checked for
refresh daily while running. Refresh failures retain the prior catalog rather
than substituting a name-based guess.

The command-line importer supports `--limit`, `--id` and `--recheck`:

```sh
pnpm --filter @workspace/api-server exec tsx \
  src/scripts/discoverInstitutionLogos.ts \
  --catalog ../../generated-artifacts/source-data/wikidata-institution-logos.json \
  --limit 40
```

The optional catalog comes from the public Wikidata SPARQL endpoint with:

```sparql
SELECT ?item ?ipeds ?logo ?website WHERE {
  ?item wdt:P1771 ?ipeds; wdt:P154 ?logo.
  OPTIONAL { ?item wdt:P856 ?website. }
}
```

The CLI packages the compressed identity metadata and verified image metadata
in the API source data for publishing. It does not package image bytes.
Startup imports the verified manifest only when the institution is not already
verified. Neither failures nor repeat imports replace existing verified logos.
Missing cache objects can be repaired on subsequent checks.

## Existing screens

The shared `InstitutionLogo` displays logos on search/matching cards, institution
profiles and saved-school/dashboard rows. Application steps use the stable
linked institution ID when one exists; an unlinked personal task cannot have a
school's logo assigned by its title. The app currently has no separate
comparison-list screen; its saved shortlist uses the shared component.

## Publishing and testing

Deploy and run `pnpm db:push` to apply the additive logo fields/asset table,
ship the manifest and activate the new UI. Cached images live in private
storage (`STORAGE_DIR`, default `.data/storage`) and are served only through
the verification-checked image routes; never expose that folder directly.
There is no startup DDL or public logo-import/upload endpoint.

Check `/api/universities/logo-coverage` on the **published hostname**, inspect an
actual verified institution response and fetch its cached image. Test a missing
image URL (404/fallback), the immutable ETag/cache headers, search/profile display
on mobile and desktop, and a saved school when signed in. Report actual preview
and production verified counts separately until both environments are checked.

No annual tuition/cost figures, homepage design, subscription plans or student
records are changed by this feature.
