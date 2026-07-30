import unittest
from pathlib import Path


PAGE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "JudgeResultsPanel.jsx"


class JudgeMultipleCompetitionsContractTest(unittest.TestCase):
    def test_judge_can_switch_between_active_competitions(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("const [assignments, setAssignments] = useState([])", source)
        self.assertIn(".filter((item) => item.status === 'active')", source)
        self.assertIn('aria-label="Competencia asignada"', source)
        self.assertIn("setSelectedAssignmentId(event.target.value)", source)
        self.assertIn("assignments.map((item)", source)

    def test_empty_wods_does_not_claim_assignment_is_missing(self):
        source = PAGE_PATH.read_text(encoding="utf-8")

        self.assertIn("Esta competencia no tiene WODs configurados.", source)
        self.assertIn("No tienes una competencia activa como juez.", source)


if __name__ == "__main__":
    unittest.main()
