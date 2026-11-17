"""Normalize official tuition files only; no network or database writes.

Amounts are not annualized or currency-converted. Ambiguous/missing/suppressed
values stay absent. ZIP members are streamed, never extracted onto project files.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile


def amount(value):
    value = str(value or "").strip().replace("$", "").replace(",", "")
    if value in ("", ".", "NULL", "PrivacySuppressed", "N/A", "-"):
        return None
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", value):
        raise ValueError("Invalid source amount")
    n = float(value)
    if not 0 <= n < 1_000_000:
        raise ValueError("Source amount outside import limits")
    return n


def prepare(path, provider):
    raw = path.read_bytes()
    member = path.name
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = [n for n in archive.namelist() if n.lower().endswith(".csv")]
            if len(names) != 1 or archive.getinfo(names[0]).file_size > 100_000_000:
                raise ValueError("Supply one year-qualified CSV (or a ZIP containing exactly one CSV under 100 MB)")
            member = names[0]
            text = archive.read(member).decode("utf-8-sig")
    else:
        text = raw.decode("utf-8-sig")
    rows = []
    if provider.startswith("bc-"):
        lines = text.splitlines()
        if not lines or "Arts Programs" not in lines[0] or "Published Date: September 2025" not in text:
            raise ValueError("Expected the reviewed September 2025 BC arts tuition release")
        is_international = provider == "bc-international-2025"
        if ("International Tuition" in lines[0]) != is_international:
            raise ValueError("BC domestic/international file mismatch")
        header = next(i for i, line in enumerate(lines) if line == "Year,Sector,Economic Development Region,Institution,Value")
        for row in csv.DictReader(lines[header:]):
            if row["Year"] != "AY 2025/26":
                continue
            value = amount(row["Value"])
            if value is not None:
                rows.append({"name": row["Institution"], "amount": value,
                             "category": "international" if is_international else "domestic"})
        if len(rows) != 25:
            raise ValueError("Expected all 25 institutions in the reviewed BC release")
    else:
        ipeds = provider == "ipeds-2023"
        if ipeds and Path(member).name.lower() != "ic2023_ay.csv":
            raise ValueError("IPEDS input must be the official ic2023_ay.csv, not an arbitrary year")
        if not ipeds:
            match = re.fullmatch(r"scorecard-(20\d{2})", provider)
            if not match:
                raise ValueError("Unsupported source")
            year = int(match[1])
            if Path(member).name != f"MERGED{year}_{(year+1)%100:02}_PP.csv":
                raise ValueError("Scorecard requires its explicit MERGEDYYYY_YY_PP.csv year; most-recent mixed-year files are not accepted")
        reader = csv.DictReader(io.StringIO(text), strict=True)
        fields = ("TUITION2", "TUITION3") if ipeds else ("TUITIONFEE_IN", "TUITIONFEE_OUT")
        required = {"UNITID", *fields, *(("XTUIT2", "XTUIT3") if ipeds else ())}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Missing official tuition columns")
        for row in reader:
            if None in row:
                raise ValueError("Malformed source CSV")
            for category, field, flag in zip(("in_state", "out_of_state"), fields, ("XTUIT2", "XTUIT3")):
                # Reported values only, not government imputations or not-applicable cells.
                if ipeds and row[flag] != "R":
                    continue
                value = amount(row[field])
                if value is not None:
                    rows.append({"ipedsId": int(row["UNITID"]), "amount": value, "category": category})
    keys = [(r.get("ipedsId", r.get("name")), r["category"]) for r in rows]
    if not rows or len(keys) != len(set(keys)):
        raise ValueError("Empty or duplicated source evidence")
    return {"provider": provider, "sourceHash": hashlib.sha256(raw).hexdigest(), "rows": rows}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--provider", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = prepare(args.input, args.provider)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
    print(json.dumps({"provider": args.provider, "quotes": len(result["rows"]), "sourceHash": result["sourceHash"]}))
