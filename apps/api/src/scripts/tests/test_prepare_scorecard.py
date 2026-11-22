"""Parser fixtures exist only in temporary files; never import them into the app."""
import csv
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("scorecard", Path(__file__).parents[1] / "prepareScorecardFiles.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
HEADERS = ["UNITID", "INSTNM", "CITY", "STABBR", "CURROPER", "CONTROL", "INSTURL", "PREDDEG"]
RECORD = ["123", "Parser fixture—not imported", "Test city", "IL", "1", "1", "https://example.invalid", "3"]


def csv_text(headers, records):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(headers)
    writer.writerows(records)
    return stream.getvalue()


class ScorecardParserTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / "prepared.json"

    def source(self, records=None):
        path = self.root / "institutions.csv"
        path.write_text(csv_text(HEADERS, records if records is not None else [RECORD]), encoding="utf-8-sig")
        return path

    def test_institution_only_and_column_mapping(self):
        MODULE.prepare(self.source(), None, self.output, None)
        payload = json.loads(self.output.read_text())
        school = payload["records"][0]["school"]
        self.assertEqual(school["ownership"], 1)
        self.assertEqual(school["name"], RECORD[1])
        self.assertEqual(school["state"], "IL")
        self.assertIsNone(payload["programFile"])
        self.assertNotIn("tuition", self.output.read_text().lower())

    def test_zip_selects_by_schema_not_first_filename(self):
        path = self.root / "official.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("dictionary.csv", "name,description\nUNITID,identifier\n")
            archive.writestr("nested/institutions.csv", csv_text(HEADERS, [RECORD]))
        MODULE.prepare(path, None, self.output, None)
        self.assertEqual(json.loads(self.output.read_text())["institutionMember"], "nested/institutions.csv")

    def test_ambiguous_archive_requires_member(self):
        path = self.root / "history.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name in ("old.csv", "new.csv"):
                archive.writestr(name, csv_text(HEADERS, [RECORD]))
        with self.assertRaisesRegex(ValueError, "found 2"):
            MODULE.prepare(path, None, self.output, None)
        MODULE.prepare(path, None, self.output, None, institution_member="new.csv")

    def test_field_file_rejected_as_institution_file(self):
        path = self.root / "fields.csv"
        path.write_text("UNITID,CIPCODE,CIPDESC,CREDDESC\n123,11,Computing,Bachelor\n")
        with self.assertRaisesRegex(ValueError, "missing expected official columns"):
            MODULE.prepare(path, None, self.output, None)
        self.assertFalse(self.output.exists())

    def test_identical_duplicates_deduplicated_and_inactive_excluded(self):
        inactive = RECORD.copy()
        inactive[0], inactive[4] = "456", "0"
        MODULE.prepare(self.source([RECORD, RECORD, inactive]), None, self.output, None)
        self.assertEqual(len(json.loads(self.output.read_text())["records"]), 1)

    def test_conflicting_duplicates_refused(self):
        conflicting = RECORD.copy()
        conflicting[1] = "Conflicting parser fixture"
        with self.assertRaisesRegex(ValueError, "Conflicting institution"):
            MODULE.prepare(self.source([RECORD, conflicting]), None, self.output, None)
        self.assertFalse(self.output.exists())

    def test_program_mapping_and_deduplication(self):
        programs = self.root / "programs.csv"
        programs.write_text(csv_text(["UNITID", "CIPCODE", "CIPDESC", "CREDDESC"],
                                     [["123", "11.01", "Computer Science", "Bachelor"]] * 2))
        MODULE.prepare(self.source(), programs, self.output, None)
        items = json.loads(self.output.read_text())["records"][0]["latest"]["programs"]["cip_4_digit"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["credential"]["title"], "Bachelor")

    def test_missing_input_refused(self):
        with self.assertRaisesRegex(ValueError, "not found"):
            MODULE.prepare(self.root / "missing.zip", None, self.output, None)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
