from pathlib import Path
import unittest


RESULTS_ROUTER_PATH = Path(__file__).resolve().parents[1] / "routers" / "results.py"
COMMAND_PAGE_PATH = Path(__file__).resolve().parents[2] / "client" / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class ResultsTiebreakContractTests(unittest.TestCase):
    def test_child_parts_can_inherit_parent_tiebreak_config(self):
        source = RESULTS_ROUTER_PATH.read_text(encoding="utf-8")

        self.assertIn("_phase_tiebreak_config", source)
        self.assertIn("parent_phase_id", source)
        self.assertIn("_phase_tiebreak_config(session, phase)", source)

    def test_multipart_result_ui_saves_tiebreak_values(self):
        source = COMMAND_PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("partTieBreakActive", source)
        self.assertIn("partTiebreakValue", source)
        self.assertIn("item.payload.tiebreak", source)


if __name__ == "__main__":
    unittest.main()
