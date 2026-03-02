def _confirm(auth_client, payload: dict):
    response = auth_client.post("/extraction/confirm", json=payload)
    assert response.status_code == 200
    return response.json()


def test_extraction_confirm_parent_child_structure_preserved(auth_client):
    payload = {
        "course_name": "EECS Parent Child",
        "term": "W26",
        "extraction_result": {
            "assessments": [
                {
                    "name": "Quizzes",
                    "weight": 20,
                    "is_bonus": False,
                    "rule_type": "best_of",
                    "rule_config": {"best_count": 2},
                    "children": [
                        {"name": "Quiz 1", "weight": 10},
                        {"name": "Quiz 2", "weight": 10},
                    ],
                },
                {"name": "Final Exam", "weight": 80, "is_bonus": False},
            ],
            "deadlines": [
                {"title": "Final Exam date is ignored in confirm mapping"},
            ],
        },
    }

    created = _confirm(auth_client, payload)
    course_id = created["course_id"]
    quizzes = next(item for item in created["course"]["assessments"] if item["name"] == "Quizzes")
    assert quizzes["rule_type"] == "best_of"
    assert quizzes["rule_config"] == {"best_count": 2}
    assert len(quizzes["children"]) == 2
    assert quizzes["children"][0]["name"] == "Quiz 1"

    listed = auth_client.get("/courses/")
    assert listed.status_code == 200
    stored = next(course for course in listed.json() if course["course_id"] == course_id)
    stored_quizzes = next(item for item in stored["assessments"] if item["name"] == "Quizzes")
    assert stored_quizzes["rule_type"] == "best_of"
    assert stored_quizzes["rule_config"] == {"best_count": 2}
    assert len(stored_quizzes["children"]) == 2


def test_extraction_confirm_preserves_drop_lowest_rule(auth_client):
    payload = {
        "course_name": "EECS Drop Lowest",
        "term": "F26",
        "extraction_result": {
            "assessments": [
                {
                    "name": "Labs",
                    "weight": 30,
                    "rule_type": "drop_lowest",
                    "rule_config": {"drop_count": 1},
                    "children": [
                        {"name": "Lab 1", "weight": 10},
                        {"name": "Lab 2", "weight": 10},
                        {"name": "Lab 3", "weight": 10},
                    ],
                },
                {"name": "Final Exam", "weight": 70},
            ],
            "deadlines": [],
        },
    }

    created = _confirm(auth_client, payload)
    labs = next(item for item in created["course"]["assessments"] if item["name"] == "Labs")
    assert labs["rule_type"] == "drop_lowest"
    assert labs["rule_config"] == {"drop_count": 1}


def test_extraction_confirm_preserves_bonus_flag(auth_client):
    payload = {
        "course_name": "EECS Bonus",
        "term": "W27",
        "extraction_result": {
            "assessments": [
                {"name": "Assignments", "weight": 90, "is_bonus": False},
                {"name": "Participation Bonus", "weight": 10, "is_bonus": True},
            ],
            "deadlines": [],
        },
    }

    created = _confirm(auth_client, payload)
    bonus_item = next(
        item for item in created["course"]["assessments"] if item["name"] == "Participation Bonus"
    )
    assert bonus_item["is_bonus"] is True


def test_extraction_confirm_without_children_still_creates_flat_course(auth_client):
    payload = {
        "course_name": "EECS Flat",
        "term": "S27",
        "extraction_result": {
            "assessments": [
                {"name": "Assignment", "weight": 20},
                {"name": "Midterm", "weight": 30},
                {"name": "Final", "weight": 50},
            ],
            "deadlines": [],
        },
    }

    created = _confirm(auth_client, payload)
    assert created["course"]["name"] == "EECS Flat"
    assert all(item["children"] is None for item in created["course"]["assessments"])
