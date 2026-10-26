"""Compare the bundled directory directly with the official NCES HD2025 archive."""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def normalized_url(value):
    return re.sub(r"^https?://", "", (value or "").strip(), flags=re.I).rstrip("/")


def verify(archive_path, bundle_path, output):
    with zipfile.ZipFile(archive_path) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith("hd2025.csv")]
        if len(members) != 1:
            raise ValueError("Expected the official hd2025.csv member.")
        with io.TextIOWrapper(archive.open(members[0]), encoding="utf-8-sig", newline="") as stream:
            official = list(csv.DictReader(stream))
    active = {row["UNITID"]: row for row in official if row["CYACTIVE"] == "1"}
    bundled = json.loads(bundle_path.read_text())
    if len(bundled) != len(active) or {row["unitid"] for row in bundled} != set(active):
        raise ValueError("Bundled UnitIDs do not exactly match the official active HD2025 set.")
    comparisons = {"name": "INSTNM", "city": "CITY", "state": "STABBR", "sector": "SECTOR"}
    url_columns = {"website": "WEBADDR", "admissionsWebsite": "ADMINURL",
                   "applicationWebsite": "APPLURL", "financialAidWebsite": "FAIDURL"}
    for row in bundled:
        source = active[row["unitid"]]
        for key, column in comparisons.items():
            if row.get(key, "").strip() != source[column].strip():
                raise ValueError(f"Official source mismatch: UnitID {row['unitid']}, {column}.")
        for key, column in url_columns.items():
            if row.get(key) and normalized_url(row.get(key)) != normalized_url(source[column]):
                raise ValueError(f"Official URL mismatch: UnitID {row['unitid']}, {column}.")
    result = {
        "source": "NCES IPEDS HD2025 — Directory information",
        "sourceUrl": "https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip",
        "catalogUrl": "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx",
        "reportingYear": "2025–26", "fileYear": 2025, "release": "Provisional",
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "archiveSha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "bundledSha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        "archiveMember": members[0], "officialRows": len(official),
        "activeRows": len(active), "matchedRows": len(bundled),
        "identityAndCoreFieldsMatch": True, "sourceWebsiteLinksMatch": True,
        "unimportedOptionalLinkCounts": {
            column: sum(not row.get(key) and bool(active[row["unitid"]][column].strip()) for row in bundled)
            for key, column in url_columns.items() if key != "website"
        },
        "urlNormalization": "Ignore an added HTTP(S) prefix and trailing slash only.",
        "activeDefinition": "CYACTIVE = 1; all such HD2025 UnitIDs are present.",
        "scope": "Institution directory only. This does not verify current applications, programs, admissions, or funding.",
    }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Verified {len(bundled):,} records against official HD2025, reporting year 2025–26 (provisional).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--bundle", type=Path, default=Path("artifacts/api-server/src/data/us-colleges-2025.json"))
    parser.add_argument("--output", type=Path, default=Path("artifacts/api-server/src/data/ipeds-provenance.json"))
    args = parser.parse_args()
    verify(args.archive, args.bundle, args.output)
