from fastapi.testclient import TestClient
import pytest

from app.main import app


def _register_and_login(
    client: TestClient,
    *,
    email: str,
    password: str = "password123",
) -> None:
    register = client.post("/auth/register", json={"email": email, "password": password})
    assert register.status_code == 200

    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200


def _login(
    client: TestClient,
    *,
    email: str,
    password: str = "password123",
) -> None:
    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200


def _create_course(
    client: TestClient,
    *,
    name: str,
    assessments: list[dict],
    term: str = "W26",
    **extra_fields,
) -> str:
    payload = {
        "name": name,
        "term": term,
        "assessments": assessments,
        **extra_fields,
    }
    response = client.post("/courses/", json=payload)
    assert response.status_code == 200
    return response.json()["course_id"]


def _update_grades(client: TestClient, course_id: str, assessments: list[dict]) -> None:
    response = client.put(f"/courses/{course_id}/grades", json={"assessments": assessments})
    assert response.status_code == 200


def _create_deadline(
    client: TestClient,
    course_id: str,
    *,
    title: str,
    due_date: str,
    due_time: str | None = None,
    assessment_name: str | None = None,
) -> dict:
    payload = {
        "title": title,
        "due_date": due_date,
        "due_time": due_time,
        "assessment_name": assessment_name,
    }
    response = client.post(f"/courses/{course_id}/deadlines", json=payload)
    assert response.status_code == 200
    return response.json()["deadline"]


def _get_state(client: TestClient) -> dict:
    response = client.get("/auth/me/state")
    assert response.status_code == 200
    return response.json()


def test_customer_resume_flow_restores_targets_across_relogin_and_refresh():
    email = "customer-resume@example.com"
    password = "password123"

    with TestClient(app) as initial_client:
        _register_and_login(initial_client, email=email, password=password)

        course_a = _create_course(
            initial_client,
            name="Resume Story A",
            assessments=[
                {"name": "Assignment", "weight": 30},
                {"name": "Final", "weight": 70},
            ],
        )
        course_b = _create_course(
            initial_client,
            name="Resume Story B",
            assessments=[
                {"name": "Quiz", "weight": 20},
                {"name": "Project", "weight": 80},
            ],
        )

        assert initial_client.post(f"/courses/{course_a}/target", json={"target": 88}).status_code == 200
        assert initial_client.post(f"/courses/{course_b}/target", json={"target": 72}).status_code == 200

        initial_state = _get_state(initial_client)
        initial_targets = {course["course_id"]: course["target_percentage"] for course in initial_state["courses"]}
        assert initial_targets == {course_a: 88.0, course_b: 72.0}

        logout = initial_client.post("/auth/logout")
        assert logout.status_code == 200

    with TestClient(app) as resumed_client:
        _login(resumed_client, email=email, password=password)

        resumed_state = _get_state(resumed_client)
        resumed_targets = {course["course_id"]: course["target_percentage"] for course in resumed_state["courses"]}
        assert resumed_targets == {course_a: 88.0, course_b: 72.0}

        course_a_target = resumed_client.get(f"/courses/{course_a}/target")
        assert course_a_target.status_code == 200
        assert course_a_target.json()["target_percentage"] == 88.0

        course_b_target = resumed_client.get(f"/courses/{course_b}/target")
        assert course_b_target.status_code == 200
        assert course_b_target.json()["target_percentage"] == 72.0

    with TestClient(app) as refreshed_client:
        _login(refreshed_client, email=email, password=password)

        refreshed_state = _get_state(refreshed_client)
        refreshed_targets = {
            course["course_id"]: course["target_percentage"]
            for course in refreshed_state["courses"]
        }
        assert refreshed_targets == {course_a: 88.0, course_b: 72.0}

        repeated_course_a_target = refreshed_client.get(f"/courses/{course_a}/target")
        assert repeated_course_a_target.status_code == 200
        assert repeated_course_a_target.json()["target_percentage"] == 88.0


def test_customer_hierarchical_flow_keeps_parent_incomplete_and_supports_child_planning(auth_client):
    course_id = _create_course(
        auth_client,
        name="Hierarchy Story",
        assessments=[
            {"name": "Midterm", "weight": 30},
            {
                "name": "Labs",
                "weight": 30,
                "children": [
                    {"name": "Lab 1", "weight": 10},
                    {"name": "Lab 2", "weight": 10},
                    {"name": "Lab 3", "weight": 10},
                ],
            },
            {"name": "Final", "weight": 40},
        ],
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Midterm", "raw_score": 78, "total_score": 100},
            {
                "name": "Labs",
                "raw_score": None,
                "total_score": None,
                "children": [
                    {"name": "Lab 1", "raw_score": 85, "total_score": 100},
                ],
            },
        ],
    )

    dashboard = auth_client.get(f"/courses/{course_id}/dashboard")
    assert dashboard.status_code == 200
    dashboard_body = dashboard.json()

    labs = next(item for item in dashboard_body["breakdown"] if item["name"] == "Labs")
    assert labs["graded"] is False
    assert labs["has_children"] is True
    assert [child["graded"] for child in labs["children"]] == [True, False, False]

    minimum_required = auth_client.post(
        f"/courses/{course_id}/minimum-required",
        json={"target": 85, "assessment_name": "Labs::Lab 2"},
    )
    assert minimum_required.status_code == 200
    minimum_body = minimum_required.json()
    assert minimum_body["assessment_name"] == "Labs::Lab 2"
    assert minimum_body["is_achievable"] is True
    assert minimum_body["minimum_required"] == pytest.approx(31.0, abs=0.5)

    whatif = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={"scenarios": [{"assessment_name": "Labs::Lab 2", "score": 92}]},
    )
    assert whatif.status_code == 200
    whatif_body = whatif.json()

    whatif_labs = next(item for item in whatif_body["breakdown"] if item["name"] == "Labs")
    whatif_lab_2 = next(child for child in whatif_labs["children"] if child["name"] == "Lab 2")
    assert whatif_lab_2["source"] == "whatif"
    assert whatif_lab_2["hypothetical_score"] == 92

    refreshed_dashboard = auth_client.get(f"/courses/{course_id}/dashboard")
    refreshed_labs = next(
        item for item in refreshed_dashboard.json()["breakdown"] if item["name"] == "Labs"
    )
    refreshed_lab_2 = next(child for child in refreshed_labs["children"] if child["name"] == "Lab 2")
    assert refreshed_lab_2["graded"] is False
    assert refreshed_lab_2["raw_score"] is None


def test_customer_advanced_rules_flow_respects_mandatory_pass_and_capped_bonus(auth_client):
    course_id = _create_course(
        auth_client,
        name="Advanced Rules Story",
        bonus_policy="capped",
        bonus_cap_percentage=95,
        assessments=[
            {"name": "Assignments", "weight": 40},
            {
                "name": "Final Exam",
                "weight": 60,
                "rule_type": "mandatory_pass",
                "rule_config": {"pass_threshold": 50},
            },
            {"name": "Participation Bonus", "weight": 10, "is_bonus": True},
        ],
    )

    _update_grades(
        auth_client,
        course_id,
        [
            {"name": "Assignments", "raw_score": 95, "total_score": 100},
            {"name": "Participation Bonus", "raw_score": 100, "total_score": 100},
        ],
    )

    dashboard = auth_client.get(f"/courses/{course_id}/dashboard")
    assert dashboard.status_code == 200
    dashboard_body = dashboard.json()

    assert dashboard_body["core_grade"] == pytest.approx(38.0, abs=0.01)
    assert dashboard_body["bonus_contribution"] == pytest.approx(10.0, abs=0.01)
    assert dashboard_body["mandatory_pass_status"]["pending_assessments"] == ["Final Exam"]

    whatif = auth_client.post(
        f"/courses/{course_id}/dashboard/whatif",
        json={"scenarios": [{"assessment_name": "Final Exam", "score": 90}]},
    )
    assert whatif.status_code == 200
    whatif_body = whatif.json()

    assert whatif_body["projected_grade"] == pytest.approx(95.0, abs=0.01)
    assert whatif_body["projected_core_grade"] == pytest.approx(92.0, abs=0.01)
    assert whatif_body["projected_bonus_contribution"] == pytest.approx(10.0, abs=0.01)
    assert whatif_body["mandatory_pass_status"]["requirements_met"] is True

    target_check = auth_client.post(f"/courses/{course_id}/target", json={"target": 96})
    assert target_check.status_code == 200
    target_body = target_check.json()
    assert target_body["maximum_possible"] == pytest.approx(95.0, abs=0.01)
    assert target_body["feasible"] is False


def test_customer_scenario_and_deadline_flow_stays_read_only_and_exports_supported_path(auth_client):
    course_id = _create_course(
        auth_client,
        name="Scenario Safety Story",
        assessments=[
            {"name": "Assignment 1", "weight": 30},
            {"name": "Project", "weight": 30},
            {"name": "Final", "weight": 40},
        ],
    )

    _update_grades(
        auth_client,
        course_id,
        [{"name": "Assignment 1", "raw_score": 82, "total_score": 100}],
    )

    project_deadline = _create_deadline(
        auth_client,
        course_id,
        title="Project Milestone",
        due_date="2026-03-27",
        due_time="12:00",
        assessment_name="Project",
    )
    _create_deadline(
        auth_client,
        course_id,
        title="Final Exam",
        due_date="2026-04-10",
        due_time="09:00",
        assessment_name="Final",
    )

    created = auth_client.post(
        f"/courses/{course_id}/scenarios",
        json={
            "name": "Best case push",
            "scenarios": [
                {"assessment_name": "Project", "score": 85},
                {"assessment_name": "Final", "score": 90},
            ],
        },
    )
    assert created.status_code == 200
    scenario_id = created.json()["scenario"]["scenario_id"]

    run = auth_client.get(f"/courses/{course_id}/scenarios/{scenario_id}/run")
    assert run.status_code == 200
    run_body = run.json()

    assert run_body["execution_mode"] == "simulation"
    assert run_body["mutates_real_grades"] is False
    assert run_body["persistence"]["supported"] is False
    assert run_body["result"]["projected_grade"] == pytest.approx(86.1, abs=0.1)

    dashboard_after = auth_client.get(f"/courses/{course_id}/dashboard")
    assert dashboard_after.status_code == 200
    after_breakdown = {item["name"]: item for item in dashboard_after.json()["breakdown"]}
    assert after_breakdown["Project"]["graded"] is False
    assert "score_percent" not in after_breakdown["Project"]
    assert after_breakdown["Final"]["graded"] is False
    assert "score_percent" not in after_breakdown["Final"]

    export = auth_client.post(
        f"/courses/{course_id}/deadlines/export/ics",
        json={
            "deadline_ids": [project_deadline["deadline_id"]],
            "min_grade_info": {"Project": {"minimum_required": 75.0}},
        },
    )
    assert export.status_code == 200
    assert "Project Milestone" in export.text
    assert "Final Exam" not in export.text
    assert "75.0" in export.text

    deadline_list = auth_client.get(f"/courses/{course_id}/deadlines")
    assert deadline_list.status_code == 200
    deadlines = deadline_list.json()["deadlines"]
    assert all(item["exported_to_gcal"] is False for item in deadlines)
    assert all(item["gcal_event_id"] is None for item in deadlines)


def test_customer_weekly_planner_flow_shows_multicourse_conflicts_and_mapping(auth_client):
    course_a = _create_course(
        auth_client,
        name="Planner Course A",
        assessments=[
            {"name": "Assignment 1", "weight": 40},
            {"name": "Final", "weight": 60},
        ],
    )
    course_b = _create_course(
        auth_client,
        name="Planner Course B",
        assessments=[
            {"name": "Quiz", "weight": 20},
            {"name": "Project", "weight": 80},
        ],
    )

    _create_deadline(
        auth_client,
        course_a,
        title="Assignment 1",
        due_date="2026-03-23",
        due_time="09:00",
        assessment_name="Assignment 1",
    )
    _create_deadline(
        auth_client,
        course_b,
        title="Project",
        due_date="2026-03-23",
        due_time="18:00",
        assessment_name="Project",
    )
    _create_deadline(
        auth_client,
        course_b,
        title="Quiz",
        due_date="2026-03-24",
        due_time="08:00",
        assessment_name="Quiz",
    )

    planner = auth_client.get("/planning/weekly?start_date=2026-03-22")
    assert planner.status_code == 200
    planner_body = planner.json()

    assert planner_body["summary"]["item_count"] == 3
    assert planner_body["summary"]["course_count"] == 2
    assert planner_body["summary"]["conflict_count"] == 1
    assert planner_body["summary"]["busiest_day"] == {
        "date": "2026-03-23",
        "item_count": 2,
        "course_count": 2,
    }

    items_by_title = {item["title"]: item for item in planner_body["items"]}
    assert items_by_title["Assignment 1"]["course_name"] == "Planner Course A"
    assert items_by_title["Assignment 1"]["assessment_weight"] == 40.0
    assert items_by_title["Project"]["course_name"] == "Planner Course B"
    assert items_by_title["Project"]["assessment_weight"] == 80.0
    assert items_by_title["Quiz"]["assessment_weight"] == 20.0

    conflict = planner_body["conflicts"][0]
    assert conflict["severity"] == "high"
    assert conflict["item_count"] == 3
    assert {item["title"] for item in conflict["items"]} == {
        "Assignment 1",
        "Project",
        "Quiz",
    }


def test_customer_risk_alert_flow_ranks_cross_course_alerts_honestly(auth_client):
    course_a = _create_course(
        auth_client,
        name="Risk Course A",
        assessments=[
            {"name": "Midterm", "weight": 60, "raw_score": 50, "total_score": 100},
            {"name": "Final", "weight": 40},
        ],
    )
    course_b = _create_course(
        auth_client,
        name="Risk Course B",
        assessments=[
            {"name": "Project", "weight": 100},
        ],
    )

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
        title="Project",
        due_date="2026-03-20",
        due_time="10:00",
        assessment_name="Project",
    )

    alerts = auth_client.get("/planning/alerts?reference_at=2026-03-22T12:00:00-04:00")
    assert alerts.status_code == 200
    alerts_body = alerts.json()

    assert [alert["rank"] for alert in alerts_body["alerts"]] == list(
        range(1, len(alerts_body["alerts"]) + 1)
    )
    assert alerts_body["alerts"][0]["type"] == "overdue_deadline"
    assert alerts_body["alerts"][0]["course_name"] == "Risk Course B"
    assert alerts_body["alerts"][1]["type"] == "impossible_target"
    assert alerts_body["alerts"][1]["course_name"] == "Risk Course A"

    alert_types = {alert["type"] for alert in alerts_body["alerts"]}
    assert alert_types == {
        "overdue_deadline",
        "near_term_deadline",
        "impossible_target",
        "high_weight_ungraded",
    }
    assert alerts_body["summary"]["course_count"] == 2
    assert alerts_body["summary"]["severity_counts"]["critical"] == 2
