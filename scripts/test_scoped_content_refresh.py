import csv
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "build_scoped_content_refresh",
    ROOT / "scripts/build-scoped-content-refresh.py",
)
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class ScopedRefreshTests(unittest.TestCase):
    def test_catalog_scope_is_1131_dynamic_and_307_stable_rows(self):
        catalog = ROOT / "research/2026-10-27/answers"
        dynamic = {}
        for edition in ("2008", "2025"):
            bank = json.loads((catalog / f"answers-{edition}.json").read_text())
            dynamic[edition] = {
                row["official_number"] for row in bank["questions"]
                if row.get("volatility") in {"medium", "high"}
            }
        counts = {"2008": 0, "2025": 0}
        stable = {"2008": 0, "2025": 0}
        with (catalog / "resolved-answers.csv").open(newline="") as stream:
            for row in csv.DictReader(stream):
                edition = row["edition_id"].removeprefix("uscis-")
                if int(row["official_number"]) in dynamic[edition]:
                    self.assertEqual(row["data_updated_on"], "2026-11-07")
                    self.assertEqual(row["suggested_update_on"], "2026-12-07")
                    counts[edition] += 1
                else:
                    self.assertEqual(row["data_updated_on"], "2026-10-27")
                    self.assertEqual(row["suggested_update_on"], "2026-11-27")
                    stable[edition] += 1
        self.assertEqual(counts, {"2008": 566, "2025": 565})
        self.assertEqual(stable, {"2008": 139, "2025": 168})

    def test_scoped_patch_has_baseline_and_rerun_guards(self):
        sql = BUILDER.build_sql()
        self.assertEqual(sql, BUILDER.OUTPUT.read_text())
        for fingerprint in BUILDER.BASELINE_FINGERPRINTS.values():
            self.assertIn(fingerprint, sql)
        self.assertIn("answer_updated_on = date '2026-11-07'", sql)
        self.assertIn("answer_updated_on = date '2026-10-27'", sql)
        self.assertIn("if v_changed <> 566", sql)
        self.assertIn("if v_changed <> 565", sql)
        self.assertIn("if v_changed <> 50", sql)
        self.assertIn("if v_changed <> 1", sql)
        self.assertIn("expected_change_on = date '2027-01-03'", sql)
        self.assertNotRegex(sql.lower(), r"\b(delete|drop|create table|alter table)\b")
        # Dates and citations may change; current answers and vacancy fields may not.
        self.assertNotRegex(sql.lower(), r"\bset\s+answers\s*=")
        self.assertNotIn("previous_officeholder =", sql)

    def test_only_oklahoma_internal_guidance_has_the_new_window(self):
        guide = json.loads(
            (ROOT / "research/2026-10-27/answers/change-guidance.json").read_text()
        )
        changed = [
            row for row in guide["records"]
            if row["geography"] == "US-OK" and row["question_number"] in (20, 23)
        ]
        self.assertEqual({(row["edition"], row["question_number"]) for row in changed}, {
            ("2008", 20), ("2025", 23)
        })
        for row in changed:
            self.assertEqual(row["expected_change_on"], "2026-11-03")
            self.assertEqual(row["expected_change_through"], "2027-01-03")
            alan = next(x for x in row["change_guidance"]["answer_candidates"] if x["answer"] == "Alan Armstrong")
            self.assertEqual(alan["expected_change_on"], "2026-11-03")
            self.assertEqual(row["change_guidance"]["assessed_on"], "2026-11-07")
        q57 = next(
            row for row in guide["records"]
            if row["edition"] == "2025" and row["question_number"] == 57 and row["geography"] == "US"
        )
        self.assertNotIn("https://www.supremecourt.gov/about/biographies.aspx", q57["change_guidance"]["source_urls"])

    def test_answer_catalog_and_provenance_are_in_sync(self):
        catalog = ROOT / "research/2026-10-27/answers"
        bank = json.loads((catalog / "answers-2025.json").read_text())
        chief = bank["questions"][56]["current_answer"]
        self.assertEqual(chief["options"], ["John Roberts", "John G. Roberts, Jr.", "Roberts"])
        url = "https://www.supremecourt.gov/about/biographies.aspx"
        self.assertIn(url, chief["source_urls"])
        sources = json.loads((catalog / "sources.json").read_text())["sources"]
        self.assertTrue(any(row["id"] == "scotus_current_justice" and row["url"] == url for row in sources))


if __name__ == "__main__":
    unittest.main()
