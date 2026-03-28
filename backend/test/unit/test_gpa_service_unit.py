# backend/test/unit/test_gpa_service_unit.py

import pytest

from app.services.gpa_service import (
    SUPPORTED_SCALES,
    GpaConversionError,
    calculate_weighted_gpa,
    convert_gpa_value,
    convert_percentage,
    convert_percentage_all_scales,
    get_scales_metadata,
)


class TestScale40Boundaries:
    def test_exactly_80_is_a_minus(self):
        r = convert_percentage(80.0, "4.0")
        assert r["letter"] == "A-"
        assert r["grade_point"] == 3.7

    def test_79_point_5_is_b_plus(self):
        r = convert_percentage(79.5, "4.0")
        assert r["letter"] == "B+"
        assert r["grade_point"] == 3.3

    def test_79_point_4_is_b_plus(self):
        r = convert_percentage(79.4, "4.0")
        assert r["letter"] == "B+"
        assert r["grade_point"] == 3.3


class TestAllScales:
    def test_returns_all_supported_scales(self):
        result = convert_percentage_all_scales(85.0)
        assert set(result.keys()) == set(SUPPORTED_SCALES)


class TestWeightedGpa:
    def test_single_course_cgpa_matches_course_grade_point(self):
        courses = [{"name": "EECS 2311", "percentage": 82.5, "credits": 3.0}]
        result = calculate_weighted_gpa(courses, "4.0")
        assert result["cgpa"] == 3.7
        assert result["courses"][0]["grade_point"] == 3.7

    def test_simple_two_course_cgpa(self):
        courses = [
            {"name": "EECS 2311", "percentage": 90.0, "credits": 3.0},
            {"name": "EECS 3311", "percentage": 70.0, "credits": 3.0},
        ]
        result = calculate_weighted_gpa(courses, "9.0")
        assert result["cgpa"] == 7.5

    def test_weighted_cgpa_uses_credits(self):
        courses = [
            {"name": "A", "percentage": 90.0, "credits": 3.0},
            {"name": "B", "percentage": 70.0, "credits": 6.0},
        ]
        result = calculate_weighted_gpa(courses, "9.0")
        assert result["cgpa"] == pytest.approx(7.0, abs=0.01)

    def test_formula_string_present(self):
        courses = [{"name": "X", "percentage": 80.0, "credits": 3.0}]
        result = calculate_weighted_gpa(courses, "4.0")
        assert "cGPA" in result["formula"]


class TestScaleConversion:
    def test_convert_gpa_value_between_supported_scales(self):
        result = convert_gpa_value(8.2, 9.0, 4.0)
        assert result["converted_gpa"] == pytest.approx(3.6444, abs=0.0001)
        assert result["normalized_percent"] == pytest.approx(91.11, abs=0.01)

    def test_convert_gpa_value_supports_arbitrary_scales(self):
        result = convert_gpa_value(8.2, 9.0, 12.0)
        assert result["converted_gpa"] == pytest.approx(10.9333, abs=0.0001)


class TestErrors:
    def test_invalid_scale_raises(self):
        with pytest.raises(GpaConversionError, match="Unsupported"):
            convert_percentage(85.0, "5.0")

    def test_negative_percentage_raises(self):
        with pytest.raises(GpaConversionError, match="percentage"):
            calculate_weighted_gpa(
                [{"name": "X", "percentage": -5, "credits": 3.0}],
                "4.0",
            )

    def test_non_positive_credits_raise(self):
        with pytest.raises(GpaConversionError, match="credits"):
            calculate_weighted_gpa(
                [{"name": "X", "percentage": 80, "credits": 0}],
                "4.0",
            )

    def test_current_gpa_cannot_exceed_source_scale(self):
        with pytest.raises(GpaConversionError, match="cannot exceed from_scale"):
            convert_gpa_value(9.5, 9.0, 4.0)


class TestMetadata:
    def test_scales_metadata_returns_all(self):
        meta = get_scales_metadata()
        assert len(meta) == len(SUPPORTED_SCALES)
        for entry in meta:
            assert "scale" in entry
            assert "bands" in entry
            assert len(entry["bands"]) > 0
