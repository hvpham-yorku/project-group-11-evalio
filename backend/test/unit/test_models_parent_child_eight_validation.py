import pytest
from pydantic import ValidationError

from app.models import Assessment


def test_parent_child_without_rule_requires_exact_weight_sum():
    # Parent weight 20, children sum 30 -> should FAIL (non-rule parent must equal sum)
    with pytest.raises(ValidationError, match="Parent assessment weight must equal sum"):
        Assessment(
            name="Labs",
            weight=20,
            children=[
                {"name": "Lab 1", "weight": 10, "raw_score": 80, "total_score": 100},
                {"name": "Lab 2", "weight": 20, "raw_score": 80, "total_score": 100},
            ],
        )


def test_best_of_parent_allows_children_sum_greater_than_parent():
    # For rule-based parents, children sum can be >= parent weight (supports “best-of”).
    a = Assessment(
        name="Quizzes",
        weight=20,
        rule_type="best_of",
        rule_config={"best_count": 2},
        children=[
            {"name": "Q1", "weight": 10, "raw_score": 80, "total_score": 100},
            {"name": "Q2", "weight": 10, "raw_score": 90, "total_score": 100},
            {"name": "Q3", "weight": 10, "raw_score": 70, "total_score": 100},
        ],
    )
    assert a.weight == 20
    assert sum(c.weight for c in a.children) == 30


def test_best_of_parent_rejects_children_sum_less_than_parent():
    with pytest.raises(
        ValidationError,
        match="Rule-based parent assessment child weights must be greater than or equal to parent weight",
    ):
        Assessment(
            name="Quizzes",
            weight=30,
            rule_type="best_of",
            rule_config={"best_count": 2},
            children=[
                {"name": "Q1", "weight": 10, "raw_score": 80, "total_score": 100},
                {"name": "Q2", "weight": 10, "raw_score": 90, "total_score": 100},
            ],
        )


def test_drop_lowest_parent_rejects_children_sum_less_than_parent():
    with pytest.raises(
        ValidationError,
        match="Rule-based parent assessment child weights must be greater than or equal to parent weight",
    ):
        Assessment(
            name="Labs",
            weight=25,
            rule_type="drop_lowest",
            rule_config={"drop_count": 1},
            children=[
                {"name": "L1", "weight": 10, "raw_score": 80, "total_score": 100},
                {"name": "L2", "weight": 10, "raw_score": 90, "total_score": 100},
            ],
        )