# Programmes

Programme pages let students compare degree programmes rather than whole
universities: tuition, application fee, deadline, intakes, entry requirements
and the documents each programme asks for.

## For administrators: adding a programme

1. Open **Admin → Programmes → Add programme** (`/admin/programmes`).
2. Search for the university in the directory and choose it.
3. Copy the details **only from the university's official pages**. Leave a field
   empty when the university does not publish it; students then see
   "Not published" instead of a guess.
   - Tuition: the amount for international students, its currency and period
     (year, semester, whole programme or credit). Put the academic year in the
     tuition note, for example "International fee for 2027/28 entry".
   - Deadline: a date, "rolling", or "not published". If there are several
     intakes, use the next one that is still open and list the others in the
     deadline note.
   - Minimum GPA: only when the university publishes one on a 4.0 scale. It
     drives the "academic fit" shown to students; other scales are never
     converted.
   - Required documents: choose a document type for each and add a short,
     plain-language note ("A copy of your valid passport"). Students' uploads of
     the same type count as ready.
4. Enter the page you read the details from and the date you checked it.
5. Save as **Draft** to review, then set **Published**.

## What students see about where details come from

| Label | When |
|---|---|
| **Confirmed by the university** | An administrator recorded that the university confirmed the current details in writing (with a note saying how). Shown for 180 days. |
| **From the university's website** | Details copied from the official page, checked within the last year. |
| **Not checked recently** | The last check is more than a year old. |

Changing any programme detail clears the university's confirmation, because the
university confirmed the old details. Changing only the status keeps it. Record a
confirmation only after the university has replied in writing; the note (for
example "Email from the admissions office, 27 Nov 2026") is shown to students.

## Starter programmes

`apps/api/src/data/programmes.json` holds five programmes read from official pages
on 27 November 2026 (Coventry University's MSc and BSc in Data Science, the
University of Debrecen and University of Pécs Medicine MDs, and TU Munich's MSc
Informatics). They are added once at start-up and are never marked as confirmed.
After that they behave like any other programme: edit or archive them in the
admin pages, and later deploys will not overwrite your changes.

## Behind the scenes

- Tables: `programmes`, and a `kind` column on `student_documents`.
- API: `GET /api/programmes` (search, filters, sorting by deadline, name or last
  check), `GET /api/programmes/filters`, `GET /api/programmes/:id`,
  `GET /api/universities/:id/programmes`, `GET /api/me/programmes/:id/readiness`,
  and administrator routes under `/api/admin/programmes`.
- Rules (labels, readiness, academic fit, input checks): `apps/api/src/lib/programmes.ts`.
- Tests: the programme rules in `testBlueprintLogic.ts`, and the full flow in
  `testProgrammes.ts`.
