"""
Integration tests for hierarchical (parent-child) assessment analytics.

Covers:
- Dashboard breakdown includes child-level details
- Parent completion status with incomplete children
- Multi-what-if breakdown with child-level scenarios
- Min-required for child assessments in hierarchical structures
"""

import pytest


# ── Helpers ──────────────────────────────────────────────────────────────────


def _create_hierarchical_course(client, *, name="Hierarchical Course"):
    """Create a course with both flat and parent-child assessments."""
    payload = {
        "name": name,
        "term": "W26",
        "assessments": [
            {"name": "Midterm", "weight": 40},
            {
                "name": "Labs",
                "weight": 30,
                "children": [
                    {"name": "Lab 1", "weight": 10},
                    {"name": "Lab 2", "weight": 10},
                    {"name": "Lab 3", "weight": 10},
                ],
            },
            {"name": "Final", "weight": 30},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200
    return r.json()["course_id"]


def _create_best_of_course(client):
    """Course with best_of rule on parent assessment."""
    payload = {
        "name": "Best Of Course",
        "term": "W26",
        "assessments": [
            {"name": "Exam", "weight": 60},
            {
                "name": "Quizzes",
                "weight": 20,
                "rule_type": "best_of",
                "rule_config": {"best_count": 2},
                "children": [
                    {"name": "Quiz 1", "weight": 10},
                    {"name": "Quiz 2", "weight": 10},
                    {"name": "Quiz 3", "weight": 10},
                ],
            },
            {"name": "Project", "weight": 20},
        ],
    }
    r = client.post("/courses/", json=payload)
    assert r.status_code == 200
    return r.json()["course_id"]


def _grade_children(client, course_id, parent_name, child_grades):
    """Grade specific children under a parent assessment.

    child_grades: list of {"name": str, "raw_score": float, "total_score": float}
    """
    r = client.put(
        f"/courses/{course_id}/grades",
        json={
            "assessments": [
                {
                    "name": parent_name,
                    "raw_score": None,
                    "total_score": None,
                    "children": child_grades,
                }
            ]
        },
    )
    assert r.status_code == 200
    return r.json()


def _grade_flat(client, course_id, name, raw_score, total_score=100):
    r = client.put(
        f"/courses/{course_id}/grades",
        json={"assessments": [{"name": name, "raw_score": raw_score, "total_score": total_score}]},
    )
    assert r.status_code == 200
    return r.json()


# ── Dashboard breakdown: child details ───────────────────────────────────────


def test_dashboard_breakdown_includes_children(auth_client):
    course_id = _create_hierarchical_course(auth_client)

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    assert r.status_code == 200
    data = r.json()

    breakdown = {item["name"]: item for item in data["breakdown"]}

    # Flat assessments should have has_children=False
    assert breakdown["Midterm"]["has_children"] is False
    assert breakdown["Final"]["has_children"] is False
    assert "children" not in breakdown["Midterm"]

    # Parent assessment should have has_children=True with children array
    labs = breakdown["Labs"]
    assert labs["has_children"] is True
    assert len(labs["children"]) == 3
    child_names = [c["name"] for c in labs["children"]]
    assert child_names == ["Lab 1", "Lab 2", "Lab 3"]

    # All children should be ungraded initially
    for child in labs["children"]:
        assert child["graded"] is False
        assert child["raw_score"] is None
        assert child["total_score"] is None
        assert child["score_percent"] is None


def test_dashboard_breakdown_children_show_scores(auth_client):
    course_id = _create_hierarchical_course(auth_client)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 28.5, "total_score": 30},
        {"name": "Lab 2", "raw_score": 30, "total_score": 35},
    ])

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    data = r.json()
    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")

    children = {c["name"]: c for c in labs["children"]}

    # Lab 1: graded, 95%
    assert children["Lab 1"]["graded"] is True
    assert children["Lab 1"]["raw_score"] == 28.5
    assert children["Lab 1"]["total_score"] == 30
    assert children["Lab 1"]["score_percent"] == pytest.approx(95.0, abs=0.1)

    # Lab 2: graded, ~85.7%
    assert children["Lab 2"]["graded"] is True
    assert children["Lab 2"]["score_percent"] == pytest.approx(85.71, abs=0.1)

    # Lab 3: still ungraded
    assert children["Lab 3"]["graded"] is False
    assert children["Lab 3"]["score_percent"] is None


def test_dashboard_best_of_rule_in_breakdown(auth_client):
    course_id = _create_best_of_course(auth_client)

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    data = r.json()
    quizzes = next(item for item in data["breakdown"] if item["name"] == "Quizzes")

    assert quizzes["has_children"] is True
    assert quizzes["rule_type"] == "best_of"
    assert quizzes["rule_config"] == {"best_count": 2}
    assert len(quizzes["children"]) == 3


# ── Parent completion status ─────────────────────────────────────────────────


def test_parent_not_graded_when_children_incomplete(auth_client):
    """Parent should not be marked graded when some children are missing grades."""
    course_id = _create_hierarchical_course(auth_client)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
    ])

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    data = r.json()
    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")

    assert labs["graded"] is False
    graded_children = [c for c in labs["children"] if c["graded"]]
    ungraded_children = [c for c in labs["children"] if not c["graded"]]
    assert len(graded_children) == 1
    assert len(ungraded_children) == 2


def test_parent_graded_when_all_children_complete(auth_client):
    course_id = _create_hierarchical_course(auth_client)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
        {"name": "Lab 2", "raw_score": 90, "total_score": 100},
        {"name": "Lab 3", "raw_score": 70, "total_score": 100},
    ])

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    data = r.json()
    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")

    assert labs["graded"] is True
    assert all(c["graded"] for c in labs["children"])


def test_parent_remaining_potential_with_partial_children(auth_client):
    """When some children are graded, remaining_potential reflects only ungraded children."""
    course_id = _create_hierarchical_course(auth_client)
    # Grade Lab 1 at 80% (contributes 80*10/100 = 8.0 points)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
    ])

    r = auth_client.get(f"/courses/{course_id}/dashboard")
    data = r.json()
    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")

    # Current: Lab1=80%*10=8, Lab2=0, Lab3=0 → 8.0
    assert labs["current_contribution"] == pytest.approx(8.0, abs=0.01)
    # Max: Lab1=80%*10=8, Lab2=100%*10=10, Lab3=100%*10=10 → 28.0
    assert labs["max_contribution"] == pytest.approx(28.0, abs=0.01)
    # Remaining: 28 - 8 = 20
    assert labs["remaining_potential"] == pytest.approx(20.0, abs=0.01)


# ── Multi-what-if with child assessments ─────────────────────────────────────


def test_multi_whatif_breakdown_includes_children(auth_client):
    course_id = _create_hierarchical_course(auth_client)
    _grade_flat(auth_client, course_id, "Midterm", 75)

    r = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Labs::Lab 1", "score": 90},
                {"assessment_name": "Labs::Lab 2", "score": 80},
            ]
        },
    )
    assert r.status_code == 200
    data = r.json()

    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")
    assert labs["has_children"] is True
    assert labs["source"] == "whatif"

    children = {c["name"]: c for c in labs["children"]}

    assert children["Lab 1"]["source"] == "whatif"
    assert children["Lab 1"]["hypothetical_score"] == 90
    assert children["Lab 1"]["score_percent"] == pytest.approx(90.0)

    assert children["Lab 2"]["source"] == "whatif"
    assert children["Lab 2"]["hypothetical_score"] == 80
    assert children["Lab 2"]["score_percent"] == pytest.approx(80.0)

    assert children["Lab 3"]["source"] == "remaining"
    assert children["Lab 3"]["hypothetical_score"] is None


def test_multi_whatif_parent_level_applies_to_all_children(auth_client):
    """When a parent-level what-if is applied, all children get the same score."""
    course_id = _create_hierarchical_course(auth_client)
    _grade_flat(auth_client, course_id, "Midterm", 80)

    r = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Labs", "score": 85},
            ]
        },
    )
    assert r.status_code == 200
    data = r.json()

    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")
    assert labs["source"] == "whatif"
    assert labs["hypothetical_score"] == 85

    # All children should show the applied score
    for child in labs["children"]:
        assert child["score_percent"] == pytest.approx(85.0)


def test_multi_whatif_child_scenario_adjusts_parent_contribution(auth_client):
    """Applying what-if to a child should change the parent's contribution."""
    course_id = _create_hierarchical_course(auth_client)

    # No what-if: Labs contribution = 0 (all ungraded, missing_percent=0)
    r_baseline = auth_client.get(f"/courses/{course_id}/dashboard")
    labs_baseline = next(
        item for item in r_baseline.json()["breakdown"] if item["name"] == "Labs"
    )
    assert labs_baseline["current_contribution"] == 0.0

    # What-if Lab 1=90, Lab 2=80: contribution = (90*10 + 80*10)/100 = 17.0
    r = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Labs::Lab 1", "score": 90},
                {"assessment_name": "Labs::Lab 2", "score": 80},
            ]
        },
    )
    assert r.status_code == 200
    labs_whatif = next(
        item for item in r.json()["breakdown"] if item["name"] == "Labs"
    )
    # With Lab1=90%*10=9, Lab2=80%*10=8, Lab3=0 → 17.0
    assert labs_whatif["contribution"] == pytest.approx(17.0, abs=0.01)


def test_multi_whatif_mixed_graded_and_whatif_children(auth_client):
    """Children can have a mix of actual grades and what-if scores."""
    course_id = _create_hierarchical_course(auth_client)
    # Grade Lab 1 for real
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 80, "total_score": 100},
    ])

    # What-if on Lab 2
    r = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Labs::Lab 2", "score": 95},
            ]
        },
    )
    assert r.status_code == 200
    data = r.json()
    labs = next(item for item in data["breakdown"] if item["name"] == "Labs")
    children = {c["name"]: c for c in labs["children"]}

    assert children["Lab 1"]["source"] == "actual"
    assert children["Lab 1"]["graded"] is True
    assert children["Lab 1"]["score_percent"] == pytest.approx(80.0)

    assert children["Lab 2"]["source"] == "whatif"
    assert children["Lab 2"]["graded"] is False
    assert children["Lab 2"]["hypothetical_score"] == 95
    assert children["Lab 2"]["score_percent"] == pytest.approx(95.0)

    assert children["Lab 3"]["source"] == "remaining"
    assert children["Lab 3"]["graded"] is False


def test_multi_whatif_best_of_with_child_scenarios(auth_client):
    """What-if on best_of parent correctly applies rule."""
    course_id = _create_best_of_course(auth_client)
    _grade_flat(auth_client, course_id, "Exam", 70)

    r = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={
            "scenarios": [
                {"assessment_name": "Quizzes::Quiz 1", "score": 90},
                {"assessment_name": "Quizzes::Quiz 2", "score": 80},
                {"assessment_name": "Quizzes::Quiz 3", "score": 50},
            ]
        },
    )
    assert r.status_code == 200
    data = r.json()
    quizzes = next(item for item in data["breakdown"] if item["name"] == "Quizzes")

    # best_of 2: picks Quiz 1 (90%) and Quiz 2 (80%)
    # contribution = (90*10 + 80*10)/100 = 17.0
    assert quizzes["contribution"] == pytest.approx(17.0, abs=0.01)
    assert quizzes["rule_type"] == "best_of"

    # All 3 children should appear in breakdown
    assert len(quizzes["children"]) == 3


# ── Min-required for child assessments ───────────────────────────────────────


def test_min_required_child_with_sibling_graded(auth_client):
    """Min-required on a child when a sibling is already graded."""
    course_id = _create_hierarchical_course(auth_client)
    _grade_flat(auth_client, course_id, "Midterm", 80)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 90, "total_score": 100},
        {"name": "Lab 2", "raw_score": 85, "total_score": 100},
    ])

    # Target 80%: need min-required on Lab 3
    # standing: Midterm=80%*40=32, Lab1=90%*10=9, Lab2=85%*10=8.5 → 49.5
    # optimistic: Final=100%*30=30 → after_others=49.5+30=79.5
    # points_needed from Lab3 = 80 - 79.5 = 0.5
    # Lab3 weight=10, required = 0.5/10*100 = 5%
    r = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 80, "assessment_name": "Labs::Lab 3"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["assessment_name"] == "Labs::Lab 3"
    assert data["is_achievable"] is True
    assert data["minimum_required"] == pytest.approx(5.0, abs=0.2)


def test_min_required_child_when_target_not_achievable(auth_client):
    """Min-required on a child returns not achievable when impossible."""
    payload = {
        "name": "Hard Course",
        "term": "W26",
        "assessments": [
            {"name": "Big Exam", "weight": 90, "raw_score": 10, "total_score": 100},
            {
                "name": "Tasks",
                "weight": 10,
                "children": [
                    {"name": "Task 1", "weight": 5, "raw_score": 100, "total_score": 100},
                    {"name": "Task 2", "weight": 5},
                ],
            },
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    course_id = r.json()["course_id"]

    # standing: BigExam=10%*90=9, Task1=100%*5=5 → 14
    # Even Task2=100% → 14+5=19. Target 80 impossible.
    r = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 80, "assessment_name": "Tasks::Task 2"},
    )
    assert r.status_code == 200
    assert r.json()["is_achievable"] is False


# ── What-if single endpoint with child path ──────────────────────────────────


def test_whatif_single_child_projected_grade(auth_client):
    """Single what-if endpoint works with child assessment path."""
    course_id = _create_hierarchical_course(auth_client)
    _grade_flat(auth_client, course_id, "Midterm", 80)
    _grade_children(auth_client, course_id, "Labs", [
        {"name": "Lab 1", "raw_score": 90, "total_score": 100},
    ])

    # standing: Midterm=80%*40=32, Lab1=90%*10=9 → 41
    # What-if Lab2=85%: projected += 85%*10/100=8.5 → 49.5
    r = auth_client.post(
        f"/courses/{course_id}/whatif",
        json={"assessment_name": "Labs::Lab 2", "hypothetical_score": 85},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["assessment_name"] == "Labs::Lab 2"
    assert data["projected_grade"] == pytest.approx(49.5, abs=0.1)
    assert data["current_standing"] == pytest.approx(41.0, abs=0.1)


# ── Projected grade consistency ──────────────────────────────────────────────


def test_projected_grade_consistent_between_whatif_and_dashboard(auth_client):
    """Multi-what-if and single what-if should give consistent results."""
    course_id = _create_hierarchical_course(auth_client)
    _grade_flat(auth_client, course_id, "Midterm", 80)

    # Single what-if on Lab 1
    r_single = auth_client.post(
        f"/courses/{course_id}/whatif",
        json={"assessment_name": "Labs::Lab 1", "hypothetical_score": 90},
    )

    # Multi what-if with same scenario
    r_multi = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={"scenarios": [{"assessment_name": "Labs::Lab 1", "score": 90}]},
    )

    assert r_single.status_code == 200
    assert r_multi.status_code == 200

    single_projected = r_single.json()["projected_grade"]
    multi_projected = r_multi.json()["projected_grade"]
    assert single_projected == pytest.approx(multi_projected, abs=0.01)
