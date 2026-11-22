"""Select non-personal, source-reported facts from the licensed PSC CSV.

This is a co-op/internship pilot, NOT a comprehensive recognition directory.
No contact names/emails, inferred locations, websites, DLI, or prices are copied.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

SOURCE_URL = "https://open.canada.ca/data/en/dataset/ab36a4ab-9b69-49b1-8be6-6faa3f0d0c67"
LICENSE_URL = "https://open.canada.ca/en/open-government-licence-canada"
LABELS = (
    "College Certificate or Diploma (excluding Quebec)", "Diploma of College Studies",
    "Attestation of Collegial Studies (Quebec only)",
    "Graduate Certificate", "Graduate Diploma", "Bachelor's degree", "Master's degree",
    "Doctorate", "Applied Degree", "Vocational Diploma",
)
# Reviewed against the bilingual source: these English labels share the exact
# same French institution/campus name. Freeze the canonical identity on refresh.
ALIASES = {"College CDI (Montreal)": "CDI College (Montreal)"}
# The source puts a subject label in the institution field. Do not publish it
# as a school without further official institution-identity evidence.
QUARANTINED = {"Health Administration"}


def normalized(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip()


def stable_id(prefix, value):
    return prefix + hashlib.sha256(value.encode()).hexdigest()[:24]


def prepare(source, destination, source_date):
    date.fromisoformat(source_date)
    schools = {}
    programs = {}
    row_count = 0
    quarantined_rows = 0
    with source.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {"institution_name_e", "program_of_study_e", "academic_level_area_of_study_e", "specialization_e", "program_type_e"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("The PSC file is missing required official columns.")
        for row in reader:
            row_count += 1
            name = normalized(row["institution_name_e"])
            if name in QUARANTINED:
                quarantined_rows += 1
                continue
            name = ALIASES.get(name, name)
            title = normalized(row["program_of_study_e"])
            if not name or not title:
                raise ValueError(f"Missing institution or program in source row {row_count}.")
            source_key = "psc:" + name.casefold()
            school_id = stable_id("ca-psc-", source_key)
            school = schools.setdefault(school_id, {
                "id": school_id, "sourceKey": source_key, "name": name,
                "countryCode": "CA", "country": "Canada", "city": "", "state": "",
                "institutionType": "Postsecondary institution / campus (PSC listing)",
                "degreeLevels": set(), "degreeTypes": set(), "majors": set(),
            })
            raw_level = normalized(row["academic_level_area_of_study_e"])
            level = next((label for label in LABELS if raw_level.startswith(label)), None)
            area = raw_level[len(level):].strip() if level else raw_level
            if level:
                school["degreeTypes"].add(level)
                if level in ("Master's degree", "Doctorate", "Graduate Certificate", "Graduate Diploma"):
                    school["degreeLevels"].add("Graduate")
                elif level in ("Bachelor's degree", "College Certificate or Diploma (excluding Quebec)", "Diploma of College Studies", "Applied Degree"):
                    school["degreeLevels"].add("Undergraduate")
            specialization = normalized(row["specialization_e"])
            fields = {value for value in [area, specialization] if value}
            school["majors"].update(fields | {title})
            program_type = normalized(row["program_type_e"]) or None
            # Cross-listing the same named credential under several study areas
            # is one source-listed program, not several duplicate programs.
            key = json.dumps([school_id, title.casefold(), level or raw_level, program_type], ensure_ascii=False)
            fact_id = stable_id("ca-psc-program-", key)
            fact = programs.setdefault(fact_id, {
                "id": fact_id, "institutionId": school_id, "kind": "program", "title": title,
                "fieldsOfStudy": set(), "degreeLevel": level, "programType": program_type,
                "language": None, "applicantStatuses": [], "requirements": [],
                "eligibility": None, "deadline": None, "officialUrl": None,
                "sourceName": "Public Service Commission of Canada", "sourceUrl": SOURCE_URL,
                "sourceDate": source_date, "sourceLicenseUrl": LICENSE_URL, "lastVerifiedAt": None,
            })
            fact["fieldsOfStudy"].update(fields)
    if not schools or not programs:
        raise ValueError("No institutions/programs prepared. No import should run.")
    for school in schools.values():
        for field in ("degreeLevels", "degreeTypes", "majors"):
            school[field] = sorted(school[field])
    for fact in programs.values():
        fact["fieldsOfStudy"] = sorted(fact["fieldsOfStudy"])
    payload = {
        "format": "unipath-international-v1", "sourceId": "ca-psc",
        "sourceDate": source_date, "sourceUrl": SOURCE_URL, "sourceLicenseUrl": LICENSE_URL,
        "sourceRowCount": row_count,
        "quarantinedRowCount": quarantined_rows,
        "quarantinedInstitutionNames": sorted(QUARANTINED),
        "institutions": sorted(schools.values(), key=lambda item: item["id"]),
        "facts": sorted(programs.values(), key=lambda item: item["id"]),
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"Prepared {len(schools)} source-listed institution/campus records and {len(programs)} distinct programs from {row_count} PSC rows. Quarantined {quarantined_rows} rows with an ambiguous institution label; merged one reviewed bilingual institution alias. No database import yet.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-date", required=True)
    args = parser.parse_args()
    prepare(args.source, args.output, args.source_date)
