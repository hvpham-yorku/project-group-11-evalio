from uuid import UUID


def _create_course(auth_client, name: str, assessments: list[dict] | None = None) -> str:
    payload = {
        "name": name,
        "term": "W26",
        "assessments": assessments
        or [
            {"name": "Assignment 1", "weight": 40, "raw_score": None, "total_score": None},
            {"name": "Final", "weight": 60, "raw_score": None, "total_score": None},
        ],
    }
    response = auth_client.post("/courses/", json=payload)
    assert response.status_code == 200
    course_id = str(response.json()["course_id"])
    UUID(course_id)
    return course_id


def _create_deadline(
    auth_client,
    course_id: str,
    *,
    title: str,
    due_date: str,
    due_time: str | None = None,
    assessment_name: str | None = None,
):
    payload = {
        "title": title,
        "due_date": due_date,
        "due_time": due_time,
        "assessment_name": assessment_name,
    }
    response = auth_client.post(f"/courses/{course_id}/deadlines", json=payload)
    assert response.status_code == 200
    return response.json()["deadline"]


def test_weekly_planner_aggregates_items_and_detects_conflicts(auth_client):
    course_a = _create_course(auth_client, "EECS2311")
    course_b = _create_course(auth_client, "EECS3311")

    _create_deadline(
        auth_client,
        course_a,
        title="Assignment 1",
        due_date="2026-03-23",
        due_time="10:00",
        assessment_name="Assignment 1",
    )
    _create_deadline(
        auth_client,
        course_b,
        title="Final Presentation",
        due_date="2026-03-24",
        due_time="09:00",
    )
    _create_deadline(
        auth_client,
        course_b,
        title="Outside Window",
        due_date="2026-03-30",
        due_time="09:00",
    )

    response = auth_client.get("/planning/weekly?start_date=2026-03-22")
    assert response.status_code == 200
    body = response.json()

    assert body["window"]["start_date"] == "2026-03-22"
    assert body["window"]["end_date"] == "2026-03-28"
    assert body["summary"]["item_count"] == 2
    assert body["summary"]["course_count"] == 2
    assert body["summary"]["conflict_count"] == 1
    assert {item["course_name"] for item in body["items"]} == {"EECS2311", "EECS3311"}

    conflict = body["conflicts"][0]
    assert conflict["item_count"] == 2
    assert conflict["course_count"] == 2
    assert conflict["severity"] in {"medium", "high"}


def test_risk_alerts_include_supported_alert_types(auth_client):
    course_a = _create_course(
        auth_client,
        "EECS2311",
        assessments=[
            {"name": "Midterm", "weight": 60, "raw_score": 50, "total_score": 100},
            {"name": "Final", "weight": 40, "raw_score": None, "total_score": None},
        ],
    )
    course_b = _create_course(auth_client, "EECS3311")

    target_response = auth_client.post(f"/courses/{course_a}/target", json={"target": 85})
    assert target_response.status_code == 200
    assert target_response.json()["feasible"] is False

    _create_deadline(
        auth_client,
        course_a,
        title="Final",
        due_date="2026-03-24",
        due_time="09:00",
        assessment_name="Final",
    )
    _create_deadline(
        auth_client,
        course_b,
        title="Project Checkpoint",
        due_date="2026-03-21",
        due_time="11:00",
    )

    response = auth_client.get(
        "/planning/alerts?reference_at=2026-03-22T12:00:00-04:00"
    )
    assert response.status_code == 200
    body = response.json()

    alert_types = {alert["type"] for alert in body["alerts"]}
    assert "overdue_deadline" in alert_types
    assert "near_term_deadline" in alert_types
    assert "impossible_target" in alert_types
    assert "high_weight_ungraded" in alert_types
    assert body["summary"]["course_count"] == 2
    assert body["summary"]["severity_counts"]["critical"] >= 1
