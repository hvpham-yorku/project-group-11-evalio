import pytest

from app.services.gpa_service import (
    GpaConversionError,
    calculate_weighted_gpa,
    convert_percentage,
    convert_percentage_all_scales,
    get_scales_metadata,
)


def test_invalid_scale_raises():
    with pytest.raises(GpaConversionError, match="Unsupported GPA scale"):
        convert_percentage(85.0, "7.0")


def test_boundary_79_5_vs_80_on_4_point_0_scale():
    # Spec: 79.5 < 80 → B+ (3.3)
    r1 = convert_percentage(79.5, "4.0")
    assert r1["letter"] == "B+"
    assert r1["grade_point"] == 3.3

    r2 = convert_percentage(80.0, "4.0")
    assert r2["letter"] == "A-"
    assert r2["grade_point"] == 3.7


def test_convert_percentage_all_scales_returns_three_tables():
    result = convert_percentage_all_scales(82.0)
    assert set(result.keys()) == {"4.0", "9.0", "10.0"}


def test_weighted_gpa_uses_course_credits():
    result = calculate_weighted_gpa(
        courses=[
            {"name": "A", "percentage": 90.0, "credits": 3.0},
            {"name": "B", "percentage": 70.0, "credits": 6.0},
        ],
        scale="9.0",
    )
    # 90 -> 9.0 points, 70 -> 6.0 points
    # Weighted: (9*3 + 6*6) / 9 = 7.0
    assert result["cgpa"] == pytest.approx(7.0, abs=0.01)


def test_scales_metadata_includes_band_tables():
    meta = get_scales_metadata()
    assert len(meta) == 3
    for item in meta:
        assert "scale" in item
        assert "bands" in item
        assert len(item["bands"]) > 0