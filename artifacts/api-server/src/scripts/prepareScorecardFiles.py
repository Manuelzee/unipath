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


@contextmanager
def rows(path, required):
    if path.suffix.lower() == ".zip":
        archive = zipfile.ZipFile(path)
        candidates = [name for name in archive.namelist() if name.lower().endswith(".csv") and not name.startswith("__MACOSX/")]
        if len(candidates) != 1:
            archive.close()
            raise ValueError(f"{path.name}: expected one CSV; found {len(candidates)}. Inspect the official download before importing.")
        stream = io.TextIOWrapper(archive.open(candidates[0]), encoding="utf-8-sig", newline="")
    else:
        archive = None
        stream = path.open(encoding="utf-8-sig", newline="")
    try:
        reader = csv.DictReader(stream)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path.name}: missing expected official columns: {', '.join(sorted(missing))}")
        yield reader
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


def prepare(institution_file, program_file, output, release_date):
    institutions = {}
    with rows(institution_file, {"UNITID", "INSTNM", "CITY", "STABBR", "CURROPER", "CONTROL"}) as source:
        for row in source:
            unitid = integer(row["UNITID"])
            if not unitid or integer(row["CURROPER"]) != 1:
                continue
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
    with rows(program_file, {"UNITID", "CIPCODE", "CIPDESC", "CREDDESC"}) as source:
        for row in source:
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
        "programFile": program_file.name,
        "records": list(institutions.values()),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(institutions):,} active institutions; {len(programs):,} have source-reported programs. Database import has NOT run.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("institution_file", type=Path)
    parser.add_argument("program_file", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--release-date", help="Source release date, only if confirmed by the official download.")
    args = parser.parse_args()
    prepare(args.institution_file, args.program_file, args.output, args.release_date)
