"""Prepare official institution and field-of-study CSV/ZIP downloads for import.

Only source-reported identity, operating status, programs and URLs are selected.
Annual prices and mixed-year "most recent" statistics are intentionally excluded.
"""
import argparse
import csv
import io
import json
from pathlib import Path
import zipfile
from contextlib import contextmanager

csv.field_size_limit(16 * 1024 * 1024)


@contextmanager
def rows(path, required, member=None, encoding="utf-8-sig"):
    if not path.is_file():
        raise ValueError(f"Official input file not found: {path}. Upload the ZIP in this chat; no database import has run.")
    if path.suffix.lower() == ".zip":
        archive = zipfile.ZipFile(path)
        candidates = [name for name in archive.namelist() if name.lower().endswith(".csv") and not name.startswith("__MACOSX/")]
        if member:
            if member not in candidates:
                archive.close()
                raise ValueError(f"{path.name}: requested CSV member not found: {member}")
            candidates = [member]
        matches = []
        try:
            for name in candidates:
                if archive.getinfo(name).file_size > 4 * 1024**3:
                    raise ValueError(f"{path.name}: CSV exceeds the 4 GiB safety limit.")
                with io.TextIOWrapper(archive.open(name), encoding=encoding, newline="") as header_stream:
                    headers = next(csv.reader(header_stream, strict=True), [])
                    if required.issubset(headers):
                        matches.append(name)
        except BaseException:
            archive.close()
            raise
        if len(matches) != 1:
            archive.close()
            raise ValueError(f"{path.name}: expected one CSV with columns {', '.join(sorted(required))}; found {len(matches)}. "
                             "Use the institution-level download, not the field-of-study file; use --institution-member/--program-member if multiple years are present.")
        selected = matches[0]
        # Stream the selected entry; never extract an archive over project files.
        stream = io.TextIOWrapper(archive.open(selected), encoding=encoding, newline="")
    else:
        if member:
            raise ValueError("A CSV member name applies only to a ZIP archive.")
        archive = None
        selected = path.name
        stream = path.open(encoding=encoding, newline="")
    try:
        reader = csv.DictReader(stream, strict=True)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name}: missing expected official columns: {', '.join(sorted(missing))}")
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError(f"{path.name}: duplicate CSV column names are ambiguous.")
        reader.source_member = selected
        print(f"Selected {path.name}: {selected} (validated column headers)")
        yield reader
    except UnicodeError as exc:
        raise ValueError(f"{path.name}: cannot decode with {encoding}; use --encoding cp1252 only if the official file uses Windows encoding.") from exc
    finally:
        stream.close()
        if archive:
            archive.close()


def integer(value):
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def text(value):
    value = str(value or "").strip()
    return None if value in ("", "NULL", "PrivacySuppressed") else value


def prepare(institution_file, program_file, output, release_date, institution_member=None, program_member=None, encoding="utf-8-sig"):
    institutions = {}
    selected_program_member = None
    with rows(institution_file, {"UNITID", "INSTNM", "CITY", "STABBR", "CURROPER", "CONTROL"}, institution_member, encoding) as source:
        selected_institution_member = source.source_member
        for row in source:
            if None in row:
                raise ValueError("Malformed institution CSV row: more values than column headers.")
            unitid = integer(row["UNITID"])
            if integer(row["CURROPER"]) != 1:
                continue
            if not unitid or unitid <= 0 or integer(row["CONTROL"]) not in (1, 2, 3):
                raise ValueError("An active institution has an invalid UNITID or CONTROL ownership code.")
            name = text(row["INSTNM"])
            if not name:
                raise ValueError(f"Active institution {unitid} has no source-reported name.")
            record = {
                "id": unitid,
                "school": {
                    "name": name, "city": text(row["CITY"]), "state": text(row["STABBR"]),
                    "operating": 1, "ownership": integer(row["CONTROL"]),
                    "website": text(row.get("INSTURL")),
                    "admissions_url": text(row.get("ADMINURL") or row.get("ADMURL")),
                    "application_url": text(row.get("APPLURL")),
                    "financial_aid_url": text(row.get("FAIDURL")),
                    "degrees_awarded": {"predominant": integer(row.get("PREDDEG"))},
                },
                "latest": {"programs": {"cip_4_digit": []}},
            }
            if unitid in institutions and institutions[unitid] != record:
                raise ValueError(f"Conflicting institution records for UNITID {unitid}.")
            institutions[unitid] = record
    if not institutions:
        raise ValueError("No active institutions found. Nothing will be imported.")
    programs = {}
    if program_file:
        with rows(program_file, {"UNITID", "CIPCODE", "CIPDESC", "CREDDESC"}, program_member, encoding) as source:
            selected_program_member = source.source_member
            for row in source:
                if None in row:
                    raise ValueError("Malformed program CSV row: more values than column headers.")
                unitid = integer(row["UNITID"])
                title = text(row["CIPDESC"])
                if unitid not in institutions or not title:
                    continue
                credential = text(row["CREDDESC"])
                key = (text(row["CIPCODE"]), title, credential)
                programs.setdefault(unitid, {})[key] = {
                    "code": text(row["CIPCODE"]), "title": title,
                    "credential": {"title": credential},
                }
    for unitid, entries in programs.items():
        institutions[unitid]["latest"]["programs"]["cip_4_digit"] = list(entries.values())
    payload = {
        "format": "unipath-scorecard-official-files-v1",
        "sourceUrl": "https://collegescorecard.ed.gov/data/",
        "sourceReleaseDate": release_date,
        "institutionFile": institution_file.name,
        "institutionMember": selected_institution_member,
        "programFile": program_file.name if program_file else None,
        "programMember": selected_program_member,
        "records": list(institutions.values()),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(institutions):,} active institutions; {len(programs):,} have source-reported programs. Database import has NOT run.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("institution_file", type=Path)
    parser.add_argument("program_file", type=Path, nargs="?", help="Optional official field-of-study ZIP/CSV; not needed to import institutions.")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--release-date", help="Source release date, only if confirmed by the official download.")
    parser.add_argument("--institution-member", help="Exact institution CSV path inside a multi-year ZIP.")
    parser.add_argument("--program-member", help="Exact field-of-study CSV path inside a multi-year ZIP.")
    parser.add_argument("--encoding", default="utf-8-sig", choices=["utf-8-sig", "cp1252"])
    args = parser.parse_args()
    prepare(args.institution_file, args.program_file, args.output, args.release_date, args.institution_member, args.program_member, args.encoding)
