from uuid import UUID

def test_create_course_success(auth_client):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "grade": None},
            {"name": "Midterm", "weight": 30, "grade": None},
            {"name": "Final", "weight": 50, "grade": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "Course created successfully"
    assert data["total_weight"] == 100
    assert "course_id" in data
    UUID(data["course_id"])

def test_create_course_rejects_empty_assessments(auth_client):
    payload = {"name": "X", "term": "W26", "assessments": []}
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 400
    assert "At least one assessment" in r.json()["detail"]

def test_create_course_rejects_total_weight_over_100(auth_client):
    payload = {
        "name": "X",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 60, "grade": None},
            {"name": "A2", "weight": 60, "grade": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 400
    assert "cannot exceed 100" in r.json()["detail"]

def test_list_courses_includes_course_id(auth_client):
    payload = {
        "name": "EECS2311",
        "term": "W26",
        "assessments": [
            {"name": "A1", "weight": 20, "raw_score": None, "total_score": None},
        ],
    }
    created = auth_client.post("/courses/", json=payload)
    assert created.status_code == 200

    listed = auth_client.get("/courses/")
    assert listed.status_code == 200
    courses = listed.json()
    assert len(courses) == 1
    assert "course_id" in courses[0]
    UUID(courses[0]["course_id"])


def test_create_course_accepts_flat_assessments_unchanged(auth_client):
    payload = {
        "name": "EECS3311",
        "term": "F26",
        "assessments": [
            {"name": "Assignment 1", "weight": 25, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 35, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 40, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["course"]["assessments"][0]["children"] is None


def test_create_course_accepts_parent_child_when_weights_match(auth_client):
    payload = {
        "name": "EECS4411",
        "term": "W27",
        "assessments": [
            {
                "name": "Labs",
                "weight": 20,
                "children": [
                    {"name": "Lab 1", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Lab 2", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    labs = next(item for item in data["course"]["assessments"] if item["name"] == "Labs")
    assert len(labs["children"]) == 2
    assert labs["children"][0]["name"] == "Lab 1"


def test_create_course_rejects_parent_child_weight_mismatch(auth_client):
    payload = {
        "name": "EECS4411",
        "term": "W27",
        "assessments": [
            {
                "name": "Labs",
                "weight": 20,
                "children": [
                    {"name": "Lab 1", "weight": 9, "raw_score": None, "total_score": None},
                    {"name": "Lab 2", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 422
    assert "Parent assessment weight must equal sum of child assessment weights" in r.text


def test_create_course_allows_rule_metadata_fields(auth_client):
    payload = {
        "name": "EECS4411",
        "term": "W27",
        "assessments": [
            {
                "name": "Quizzes",
                "weight": 20,
                "rule_type": "best_of",
                "rule_config": {"best": 10, "total": 11},
                "children": [
                    {"name": "Quiz 1", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Quiz 2", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    quizzes = next(item for item in data["course"]["assessments"] if item["name"] == "Quizzes")
    assert quizzes["rule_type"] == "best_of"
    assert quizzes["rule_config"] == {"best": 10, "total": 11}


def test_create_course_allows_rule_based_children_sum_above_parent(auth_client):
    payload = {
        "name": "EECS Rule Based",
        "term": "W27",
        "assessments": [
            {
                "name": "Quizzes",
                "weight": 20,
                "rule_type": "best_of",
                "rule_config": {"best_count": 2, "total_count": 3},
                "children": [
                    {"name": "Quiz 1", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Quiz 2", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Quiz 3", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Final", "weight": 80, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200


def test_create_course_rejects_rule_based_children_sum_below_parent(auth_client):
    payload = {
        "name": "EECS Rule Based",
        "term": "W27",
        "assessments": [
            {
                "name": "Quizzes",
                "weight": 35,
                "rule_type": "drop_lowest",
                "rule_config": {"drop_count": 1, "total_count": 4},
                "children": [
                    {"name": "Quiz 1", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Quiz 2", "weight": 10, "raw_score": None, "total_score": None},
                    {"name": "Quiz 3", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Final", "weight": 65, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 422
    assert "Rule-based parent assessment child weights must be greater than or equal to parent weight" in r.text


def test_create_course_rejects_invalid_child_scores(auth_client):
    payload = {
        "name": "EECS4411",
        "term": "W27",
        "assessments": [
            {
                "name": "Labs",
                "weight": 20,
                "children": [
                    {"name": "Lab 1", "weight": 10, "raw_score": -1, "total_score": 10},
                    {"name": "Lab 2", "weight": 10, "raw_score": None, "total_score": None},
                ],
            },
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 422


def test_create_course_accepts_is_bonus_default_false(auth_client):
    payload = {
        "name": "EECS4411",
        "term": "W27",
        "assessments": [
            {"name": "Assignment", "weight": 20, "raw_score": None, "total_score": None},
            {"name": "Midterm", "weight": 30, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 50, "raw_score": None, "total_score": None},
        ],
    }
    r = auth_client.post("/courses/", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert all(item["is_bonus"] is False for item in data["course"]["assessments"])
