import unittest

from competition_rules import (
    PHASE_MEASUREMENT_METHODS_ALLOWED,
    filter_visible_phases,
    normalize_phase_measurement_method,
    normalize_phase_visibility,
    normalize_rm_unit,
)
from constants import MedicionFase, UnidadRM


class CompetitionRulesTests(unittest.TestCase):
    def test_allowed_phase_measurements_are_limited(self):
        self.assertEqual(
            PHASE_MEASUREMENT_METHODS_ALLOWED,
            {
                MedicionFase.FOR_TIME,
                MedicionFase.AMRAP,
                MedicionFase.EMOM,
                MedicionFase.METROS,
                MedicionFase.RM,
            },
        )

    def test_legacy_measurements_normalize_to_supported_values(self):
        self.assertEqual(
            normalize_phase_measurement_method(MedicionFase.TIEMPO_HMS, "tiempo"),
            MedicionFase.FOR_TIME,
        )
        self.assertEqual(
            normalize_phase_measurement_method(MedicionFase.REPETICIONES, "cantidad"),
            MedicionFase.AMRAP,
        )
        self.assertEqual(
            normalize_phase_measurement_method(MedicionFase.KILOGRAMOS, "cantidad"),
            MedicionFase.RM,
        )

    def test_rm_unit_defaults_to_kg_and_accepts_lb(self):
        self.assertEqual(normalize_rm_unit(None), UnidadRM.KG)
        self.assertEqual(normalize_rm_unit("lb"), UnidadRM.LB)
        self.assertEqual(normalize_rm_unit("LBS"), UnidadRM.LB)
        self.assertEqual(normalize_rm_unit("otra"), UnidadRM.KG)

    def test_visibility_flag_is_binary(self):
        self.assertEqual(normalize_phase_visibility(None), 1)
        self.assertEqual(normalize_phase_visibility(0), 0)
        self.assertEqual(normalize_phase_visibility(False), 0)
        self.assertEqual(normalize_phase_visibility("1"), 1)

    def test_filter_visible_phases_removes_hidden_items(self):
        phases = [
            {"id": 1, "is_visible": 1},
            {"id": 2, "is_visible": 0},
            {"id": 3},
        ]

        self.assertEqual(
            [item["id"] for item in filter_visible_phases(phases)],
            [1, 3],
        )


if __name__ == "__main__":
    unittest.main()
