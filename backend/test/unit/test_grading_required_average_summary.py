import pytest

from app.services.grading_service import calculate_required_average_summary


def test_required_average_complete_when_no_remaining_weight():
    summary = calculate_required_average_summary(
        current_standing=75.0,
        target_percentage=80.0,
        remaining_weight=0.0,
    )
    assert summary["classification"] == "Complete"
    assert summary["required_average"] == 0.0


def test_required_average_already_achieved_when_target_below_current():
    summary = calculate_required_average_summary(
        current_standing=85.0,
        target_percentage=80.0,
        remaining_weight=20.0,
    )
    assert summary["classification"] == "Already Achieved"
    assert summary["required_average"] == 0.0


@pytest.mark.parametrize(
    ("required_avg", "expected_label"),
    [
        (101.0, "Not Possible"),
        (100.0, "Very Challenging"),
        (96.0, "Very Challenging"),
        (90.0, "Challenging"),
        (75.0, "Achievable"),
        (60.0, "Comfortable"),
    ],
)
def test_required_average_classification_buckets(required_avg, expected_label):
    # required_avg = (required_points / remaining_weight) * 100
    remaining_weight = 50.0
    required_points = (required_avg / 100.0) * remaining_weight
    current_standing = 20.0
    target = current_standing + required_points

    summary = calculate_required_average_summary(
        current_standing=current_standing,
        target_percentage=target,
        remaining_weight=remaining_weight,
    )
    assert summary["classification"] == expected_label