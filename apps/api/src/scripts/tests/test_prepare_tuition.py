import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_tuition", Path(__file__).parents[1] / "prepareTuitionFiles.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TuitionFilesTests(unittest.TestCase):
    def fixture(self, name, text, provider):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / name
            path.write_text(text)
            return module.prepare(path, provider)

    def test_ipeds_categories_and_missing(self):
        result = self.fixture("ic2023_ay.csv",
            "UNITID,XTUIT2,TUITION2,XTUIT3,TUITION3\n123,R,0,R,25000\n124,A,.,R,5000\n", "ipeds-2023")
        self.assertEqual([(r["category"], r["amount"]) for r in result["rows"]],
                         [("in_state", 0), ("out_of_state", 25000), ("out_of_state", 5000)])
        self.assertEqual(len(result["sourceHash"]), 64)

    def test_scorecard_is_year_qualified(self):
        text = "UNITID,TUITIONFEE_IN,TUITIONFEE_OUT\n123,PrivacySuppressed,12345\n"
        result = self.fixture("MERGED2023_24_PP.csv", text, "scorecard-2023")
        self.assertEqual(result["rows"], [{"ipedsId": 123, "amount": 12345, "category": "out_of_state"}])
        with self.assertRaises(ValueError):
            self.fixture("Most-Recent-Cohorts-Institution.csv", text, "scorecard-2023")

    def test_invalid_and_duplicate_values(self):
        for value in ("-1", "NaN", "Infinity", "1000000"):
            with self.assertRaises(ValueError):
                self.fixture("MERGED2023_24_PP.csv", f"UNITID,TUITIONFEE_IN,TUITIONFEE_OUT\n123,{value},NULL\n", "scorecard-2023")
        with self.assertRaises(ValueError):
            self.fixture("MERGED2023_24_PP.csv", "UNITID,TUITIONFEE_IN,TUITIONFEE_OUT\n123,1,2\n123,1,2\n", "scorecard-2023")

    def test_wrong_bc_category_rejected(self):
        with self.assertRaises(ValueError):
            self.fixture("bc.csv", "Annual International Tuition Fees for Arts Programs\nPublished Date: September 2025", "bc-domestic-2025")

    def test_bundled_manifests_have_unique_categories(self):
        for name in ("ipeds-2023", "bc-domestic-2025", "bc-international-2025"):
            data = json.loads((Path(__file__).parents[3] / f"data/tuition/{name}.json").read_text())
            keys = [(r.get("ipedsId", r.get("name")), r["category"]) for r in data["rows"]]
            self.assertEqual(len(set(keys)), len(keys))


if __name__ == "__main__":
    unittest.main()
