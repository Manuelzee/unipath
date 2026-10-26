import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "prepareCanadaPsc.py"
SPEC = importlib.util.spec_from_file_location("prepare_psc", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CanadaPreparationTests(unittest.TestCase):
    def prepare(self, rows):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.csv"
            output = Path(folder) / "prepared.json"
            headers = [
                "institution_name_e", "institution_name_f", "program_of_study_e",
                "academic_level_area_of_study_e", "specialization_e", "program_type_e",
                "contact", "contact_email",
            ]
            with source.open("w", newline="", encoding="utf-8-sig") as stream:
                writer = csv.DictWriter(stream, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)
            MODULE.prepare(source, output, "2026-09-01")
            return json.loads(output.read_text())

    @staticmethod
    def row(**changes):
        return {
            "institution_name_e": "Test College", "institution_name_f": "Collège de test",
            "program_of_study_e": "Computing", "academic_level_area_of_study_e": "Bachelor's degreeSciences",
            "specialization_e": "Computer Sciences", "program_type_e": "CO-OP",
            "contact": "A fictional contact", "contact_email": "test@example.invalid",
            **changes,
        }

    def test_cross_listed_programs_deduplicate_without_losing_fields(self):
        result = self.prepare([self.row(), self.row(academic_level_area_of_study_e="Bachelor's degreeEngineering")])
        self.assertEqual(len(result["institutions"]), 1)
        self.assertEqual(len(result["facts"]), 1)
        self.assertIn("Engineering", result["facts"][0]["fieldsOfStudy"])
        self.assertIn("Sciences", result["facts"][0]["fieldsOfStudy"])
        self.assertEqual(result["facts"][0]["degreeLevel"], "Bachelor's degree")

    def test_no_personal_contacts_or_inferred_school_facts(self):
        result = self.prepare([self.row()])
        serialized = json.dumps(result)
        self.assertNotIn("example.invalid", serialized)
        self.assertNotIn("fictional contact", serialized)
        school, fact = result["institutions"][0], result["facts"][0]
        self.assertEqual(school["city"], "")
        for field in ("language", "officialUrl", "deadline", "lastVerifiedAt"):
            self.assertIsNone(fact[field])
        self.assertEqual(fact["applicantStatuses"], [])

    def test_reviewed_alias_and_invalid_institution_label(self):
        result = self.prepare([
            self.row(institution_name_e="CDI College (Montreal)"),
            self.row(institution_name_e="College CDI (Montreal)"),
            self.row(institution_name_e="Health Administration"),
        ])
        self.assertEqual(len(result["institutions"]), 1)
        self.assertEqual(result["quarantinedRowCount"], 1)

    def test_identity_survives_source_row_order_changes(self):
        first, second = self.row(), self.row(program_of_study_e="Biology")
        a = self.prepare([first, second])
        b = self.prepare([second, first])
        self.assertEqual([x["id"] for x in a["institutions"]], [x["id"] for x in b["institutions"]])
        self.assertEqual([x["id"] for x in a["facts"]], [x["id"] for x in b["facts"]])

    def test_empty_or_ambiguous_only_file_cannot_be_imported(self):
        with self.assertRaises(ValueError):
            self.prepare([self.row(institution_name_e="Health Administration")])


if __name__ == "__main__":
    unittest.main()
