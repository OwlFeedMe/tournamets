from pathlib import Path
import unittest


ADMIN_WORKSPACE_PATH = Path(__file__).resolve().parents[1] / "src" / "pages" / "AdminCompetitionCommandProposal.jsx"


class AdminWorkspaceCompetitionDatesTimezoneTest(unittest.TestCase):
    def test_competition_dates_use_competition_timezone_helpers(self):
        source = ADMIN_WORKSPACE_PATH.read_text(encoding="utf-8")

        self.assertIn("utcToCompetitionDateTimeInput", source)
        self.assertIn("competitionDateTimeInputToUtc", source)
        self.assertIn("dateTimeInput(item?.competition_start, item?.timezone)", source)
        self.assertIn("toUtcOrNull(draft.competition_start, draft.timezone)", source)


if __name__ == "__main__":
    unittest.main()
