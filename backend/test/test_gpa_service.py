"""
Tests for GPA Conversion Service — SCRUM-109

Covers:
- Boundary correctness (79.4 vs 79.5 vs 80.0)
- All three scales (4.0, 9.0, 10.0)
- cGPA weighted calculation
- Non-numeric grade exclusion
- Edge cases (0%, 100%, invalid scale)
"""

import pytest

from app.services.gpa_service import (
    SUPPORTED_SCALES,
    GpaConversionError,
    calculate_weighted_gpa,
    convert_percentage,
    convert_percentage_all_scales,
    get_scales_metadata,
)


# ─── Boundary Tests (4.0 OMSAS Scale) ────────────────────────────────────────

class TestScale40Boundaries:
    """Verify >= comparison against inclusive lower bounds."""

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

    def test_90_is_a_plus(self):
        r = convert_percentage(90.0, "4.0")
        assert r["letter"] == "A+"
        assert r["grade_point"] == 4.0

    def test_89_9_is_a(self):
        r = convert_percentage(89.9, "4.0")
        assert r["letter"] == "A"
        assert r["grade_point"] == 3.9

    def test_50_is_d_minus(self):
        r = convert_percentage(50.0, "4.0")
        assert r["letter"] == "D-"
        assert r["grade_point"] == 0.7

    def test_49_9_is_f(self):
        r = convert_percentage(49.9, "4.0")
        assert r["letter"] == "F"
        assert r["grade_point"] == 0.0

    def test_0_percent_is_f(self):
        r = convert_percentage(0.0, "4.0")
        assert r["letter"] == "F"
        assert r["grade_point"] == 0.0

    def test_100_percent_is_a_plus(self):
        r = convert_percentage(100.0, "4.0")
        assert r["letter"] == "A+"
        assert r["grade_point"] == 4.0


# ─── YorkU 9.0 Scale ─────────────────────────────────────────────────────────

class TestScale90:
    def test_90_is_a_plus(self):
        r = convert_percentage(90.0, "9.0")
        assert r["letter"] == "A+"
        assert r["grade_point"] == 9.0

    def test_80_is_a(self):
        r = convert_percentage(80.0, "9.0")
        assert r["letter"] == "A"
        assert r["grade_point"] == 8.0

    def test_79_is_b_plus(self):
        r = convert_percentage(79.0, "9.0")
        assert r["letter"] == "B+"
        assert r["grade_point"] == 7.0

    def test_40_is_e(self):
        r = convert_percentage(40.0, "9.0")
        assert r["letter"] == "E"
        assert r["grade_point"] == 1.0

    def test_39_is_f(self):
        r = convert_percentage(39.0, "9.0")
        assert r["letter"] == "F"
        assert r["grade_point"] == 0.0


# ─── 10.0 International Scale ────────────────────────────────────────────────

class TestScale100:
    def test_95_is_a_plus(self):
        r = convert_percentage(95.0, "10.0")
        assert r["letter"] == "A+"
        assert r["grade_point"] == 10.0

    def test_94_is_a(self):
        r = convert_percentage(94.0, "10.0")
        assert r["letter"] == "A"
        assert r["grade_point"] == 9.0


# ─── All-Scales Conversion ───────────────────────────────────────────────────

class TestAllScales:
    def test_returns_all_supported_scales(self):
        result = convert_percentage_all_scales(85.0)
        assert set(result.keys()) == set(SUPPORTED_SCALES)

    def test_85_maps_correctly_per_scale(self):
        result = convert_percentage_all_scales(85.0)
        assert result["4.0"]["letter"] == "A"       # 85 >= 85
        assert result["9.0"]["letter"] == "A"       # 85 >= 80
        assert result["10.0"]["letter"] == "A-"     # 85 >= 85


# ─── Weighted cGPA ────────────────────────────────────────────────────────────

class TestWeightedGpa:
    def test_simple_two_course_cgpa(self):
        courses = [
            {"name": "EECS 2311", "percentage": 90.0, "credits": 3.0},
            {"name": "EECS 3311", "percentage": 70.0, "credits": 3.0},
        ]
        result = calculate_weighted_gpa(courses, "9.0")
        # A+ (9) × 3 + B (6) × 3 → (27 + 18) / 6 = 7.5
        assert result["cgpa"] == 7.5

    def test_non_numeric_excluded_from_gpa(self):
        courses = [
            {"name": "EECS 2311", "percentage": 90.0, "credits": 3.0},
            {"name": "GEN ED", "percentage": None, "credits": 3.0, "grade_type": "pass_fail"},
        ]
        result = calculate_weighted_gpa(courses, "9.0")
        assert result["cgpa"] == 9.0  # Only EECS counted
        assert len(result["excluded"]) == 1
        assert result["excluded"][0]["name"] == "GEN ED"

    def test_empty_numeric_courses_returns_zero(self):
        courses = [
            {"name": "PHYS", "percentage": None, "credits": 3.0, "grade_type": "withdrawn"},
        ]
        result = calculate_weighted_gpa(courses, "4.0")
        assert result["cgpa"] == 0.0

    def test_formula_string_present(self):
        courses = [{"name": "X", "percentage": 80.0, "credits": 3.0}]
        result = calculate_weighted_gpa(courses, "4.0")
        assert "cGPA" in result["formula"]


# ─── Error Handling ───────────────────────────────────────────────────────────

class TestErrors:
    def test_invalid_scale_raises(self):
        with pytest.raises(GpaConversionError, match="Unsupported"):
            convert_percentage(85.0, "5.0")

    def test_weighted_gpa_invalid_scale(self):
        with pytest.raises(GpaConversionError):
            calculate_weighted_gpa(
                [{"name": "X", "percentage": 80.0, "credits": 3.0}], "99.0"
            )


# ─── Metadata ────────────────────────────────────────────────────────────────

class TestMetadata:
    def test_scales_metadata_returns_all(self):
        meta = get_scales_metadata()
        assert len(meta) == len(SUPPORTED_SCALES)
        for entry in meta:
            assert "scale" in entry
            assert "bands" in entry
            assert len(entry["bands"]) > 0


# ─── GPA Endpoint Integration Tests ──────────────────────────────────────────

class TestGpaEndpoints:
    """Integration tests through the FastAPI router."""

    def _create_course(self, client):
        return client.post("/courses/", json={
            "name": "EECS 2311",
            "term": "F25",
            "assessments": [
                {"name": "Midterm", "weight": 30, "raw_score": 85, "total_score": 100},
                {"name": "Final", "weight": 50, "raw_score": 75, "total_score": 100},
                {"name": "Project", "weight": 20, "raw_score": 90, "total_score": 100},
            ],
        })

    def test_get_course_gpa(self, auth_client):
        r = self._create_course(auth_client)
        assert r.status_code == 200
        course_id = r.json()["course_id"]

        gpa_resp = auth_client.get(f"/courses/{course_id}/gpa?scale=9.0")
        assert gpa_resp.status_code == 200
        data = gpa_resp.json()
        assert "gpa" in data
        assert "all_scales" in data
        assert data["gpa"]["scale"] == "9.0"

    def test_get_course_gpa_invalid_scale(self, auth_client):
        r = self._create_course(auth_client)
        course_id = r.json()["course_id"]
        resp = auth_client.get(f"/courses/{course_id}/gpa?scale=7.0")
        assert resp.status_code == 400

    def test_scales_endpoint(self, auth_client):
        resp = auth_client.get("/gpa/scales")
        assert resp.status_code == 200
        assert "scales" in resp.json()

    def test_cgpa_endpoint(self, auth_client):
        resp = auth_client.post("/gpa/cgpa", json={
            "courses": [
                {"name": "A", "percentage": 90, "credits": 3},
                {"name": "B", "percentage": 70, "credits": 3},
            ],
            "scale": "4.0",
        })
        assert resp.status_code == 200
        assert "cgpa" in resp.json()
