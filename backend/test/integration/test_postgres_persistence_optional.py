import pytest
import psycopg
from datetime import datetime
from uuid import UUID

from sqlalchemy import select, text

from app.db import AssessmentDB
from app.models import CourseCreate, Assessment
from app.models_deadline import DeadlineCreate
from app.repositories.inmemory_calendar_repo import InMemoryCalendarRepository
from app.services.course_service import CourseService
from app.services.deadline_service import DeadlineService
from app.services.planning_service import PlanningService
from app.services.scenario_service import ScenarioService, ScenarioValidationError

assert psycopg is not None, "psycopg is required to run DB persistence tests"

from app.repositories.postgres_user_repo import PostgresUserRepository
from app.repositories.postgres_course_repo import PostgresCourseRepository
from app.repositories.postgres_deadline_repo import PostgresDeadlineRepository
from app.repositories.postgres_grade_target_repo import PostgresGradeTargetRepository
from app.repositories.postgres_scenario_repo import PostgresScenarioRepository


@pytest.fixture
def pg_repos():
    user_repo = PostgresUserRepository()
    course_repo = PostgresCourseRepository()
    scenario_repo = PostgresScenarioRepository()

    # Clean start (order matters)
    scenario_repo.clear()
    course_repo.clear()
    user_repo.clear()

    yield user_repo, course_repo, scenario_repo

    # Cleanup
    scenario_repo.clear()
    course_repo.clear()
    user_repo.clear()


@pytest.fixture
def pg_planning_stack():
    user_repo = PostgresUserRepository()
    course_repo = PostgresCourseRepository()
    deadline_repo = PostgresDeadlineRepository()
    target_repo = PostgresGradeTargetRepository()

    target_repo.clear()
    deadline_repo.clear()
    course_repo.clear()
    user_repo.clear()

    course_service = CourseService(course_repo)
    deadline_service = DeadlineService(deadline_repo, InMemoryCalendarRepository())
    planning_service = PlanningService(course_service, deadline_service, target_repo)

    yield user_repo, course_repo, deadline_repo, target_repo, planning_service

    target_repo.clear()
    deadline_repo.clear()
    course_repo.clear()
    user_repo.clear()


def test_postgres_persists_courses_and_scenarios_across_repo_instances(pg_repos):
    user_repo, course_repo, scenario_repo = pg_repos

    # Create user
    user = user_repo.create_user(email="pg@test.com", password_hash="dummyhash")
    user_id = user.user_id

    # Create course
    course = CourseCreate(
        name="EECS2311",
        term="W26",
        assessments=[
            Assessment(name="A1", weight=20, raw_score=None, total_score=None),
            Assessment(name="Final", weight=80, raw_score=None, total_score=None),
        ],
    )
    stored = course_repo.create(user_id=user_id, course=course)
    course_id = stored.course_id
    assert isinstance(course_id, UUID)

    # Create scenario using service (validates assessment names)
    course_service = CourseService(course_repo)
    scenario_service = ScenarioService(scenario_repo, course_service)

    saved = scenario_service.save_scenario(
        user_id=user_id,
        course_id=course_id,
        name="Final 90",
        entries=[{"assessment_name": "Final", "score": 90}],
    )
    scenario_id = saved["scenario"]["scenario_id"]

    # "Restart" simulation: new repository instances
    course_repo2 = PostgresCourseRepository()
    scenario_repo2 = PostgresScenarioRepository()

    # Verify course persists
    listed = course_repo2.list_all(user_id=user_id)
    assert len(listed) == 1
    assert listed[0].course_id == course_id

    # Verify scenario persists
    scenarios = scenario_repo2.list_all(user_id=user_id, course_id=course_id)
    assert len(scenarios) == 1
    assert str(scenarios[0].scenario_id) == str(scenario_id)


def test_postgres_mandatory_pass_rule_round_trips(pg_repos):
    user_repo, course_repo, _scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-rules@test.com", password_hash="dummyhash")
    user_id = user.user_id

    course = CourseCreate(
        name="Mandatory Pass Persistence",
        term="W26",
        assessments=[
            Assessment(name="Assignments", weight=40, raw_score=None, total_score=None),
            Assessment(
                name="Final Exam",
                weight=60,
                raw_score=None,
                total_score=None,
                rule_type="mandatory_pass",
                rule_config={"pass_threshold": 55},
            ),
        ],
    )

    stored = course_repo.create(user_id=user_id, course=course)
    reloaded = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)

    assert reloaded is not None
    final_exam = next(
        assessment
        for assessment in reloaded.course.assessments
        if assessment.name == "Final Exam"
    )
    assert final_exam.rule_type == "mandatory_pass"
    assert final_exam.rule_config == {"pass_threshold": 55.0}


def test_postgres_bonus_policy_round_trips(pg_repos):
    user_repo, course_repo, _scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-bonus@test.com", password_hash="dummyhash")
    user_id = user.user_id

    course = CourseCreate(
        name="Bonus Policy Persistence",
        term="W26",
        bonus_policy="capped",
        bonus_cap_percentage=100,
        assessments=[
            Assessment(name="Midterm", weight=90, raw_score=None, total_score=None),
            Assessment(
                name="Participation Bonus",
                weight=10,
                raw_score=None,
                total_score=None,
                is_bonus=True,
            ),
        ],
    )

    stored = course_repo.create(user_id=user_id, course=course)
    reloaded = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)

    assert reloaded is not None
    assert reloaded.course.bonus_policy == "capped"
    assert reloaded.course.bonus_cap_percentage == 100.0
    bonus_item = next(
        assessment
        for assessment in reloaded.course.assessments
        if assessment.name == "Participation Bonus"
    )
    assert bonus_item.is_bonus is True


def test_postgres_course_update_preserves_advanced_rule_metadata(pg_repos):
    user_repo, course_repo, _scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-update@test.com", password_hash="dummyhash")
    user_id = user.user_id

    initial = CourseCreate(
        name="Advanced Rule Update",
        term="W26",
        bonus_policy="additive",
        assessments=[
            Assessment(name="Assignments", weight=40, raw_score=None, total_score=None),
            Assessment(
                name="Final Exam",
                weight=60,
                raw_score=None,
                total_score=None,
                rule_type="mandatory_pass",
                rule_config={"pass_threshold": 50},
            ),
        ],
    )

    stored = course_repo.create(user_id=user_id, course=initial)
    updated = CourseCreate(
        name="Advanced Rule Update Revised",
        term="W26",
        bonus_policy="capped",
        bonus_cap_percentage=95,
        assessments=[
            Assessment(name="Assignments", weight=40, raw_score=80, total_score=100),
            Assessment(
                name="Final Exam",
                weight=60,
                raw_score=None,
                total_score=None,
                rule_type="mandatory_pass",
                rule_config={"pass_threshold": 60},
            ),
        ],
    )

    course_repo.update(user_id=user_id, course_id=stored.course_id, course=updated)
    reloaded = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)

    assert reloaded is not None
    assert reloaded.course.name == "Advanced Rule Update Revised"
    assert reloaded.course.bonus_policy == "capped"
    assert reloaded.course.bonus_cap_percentage == 95.0
    final_exam = next(
        assessment
        for assessment in reloaded.course.assessments
        if assessment.name == "Final Exam"
    )
    assert final_exam.rule_type == "mandatory_pass"
    assert final_exam.rule_config == {"pass_threshold": 60.0}


def test_postgres_backfills_legacy_bonus_policy_to_additive(pg_repos):
    user_repo, course_repo, _scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-backfill@test.com", password_hash="dummyhash")
    user_id = user.user_id

    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Legacy Bonus Policy Course",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=100, raw_score=None, total_score=None),
            ],
        ),
    )

    with course_repo._session_factory() as session:
        session.execute(text("ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_bonus_policy_check"))
        session.execute(
            text("ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_bonus_cap_percentage_policy_check")
        )
        session.execute(text("ALTER TABLE courses ALTER COLUMN bonus_policy DROP NOT NULL"))
        session.execute(
            text(
                """
                UPDATE courses
                SET bonus_policy = NULL,
                    bonus_cap_percentage = NULL
                WHERE id = :course_id
                """
            ),
            {"course_id": stored.course_id},
        )
        session.commit()

    reloaded_repo = PostgresCourseRepository()
    reloaded = reloaded_repo.get_by_id(user_id=user_id, course_id=stored.course_id)

    assert reloaded is not None
    assert reloaded.course.bonus_policy == "additive"
    assert reloaded.course.bonus_cap_percentage is None


def test_postgres_course_update_preserves_assessment_ids(pg_repos):
    user_repo, course_repo, _scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-assessment-ids@test.com", password_hash="dummyhash")
    user_id = user.user_id

    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Assessment Identity",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=40, raw_score=75, total_score=100),
                Assessment(name="Final", weight=60, raw_score=None, total_score=None),
            ],
        ),
    )

    with course_repo._session_factory() as session:
        before_rows = session.scalars(
            select(AssessmentDB)
            .where(
                AssessmentDB.course_id == stored.course_id,
                AssessmentDB.parent_assessment_id.is_(None),
            )
            .order_by(AssessmentDB.name.asc())
        ).all()
        before_ids = {row.name: row.id for row in before_rows}

    course_repo.update(
        user_id=user_id,
        course_id=stored.course_id,
        course=CourseCreate(
            name="Assessment Identity Revised",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=35, raw_score=80, total_score=100),
                Assessment(name="Final", weight=65, raw_score=None, total_score=None),
            ],
        ),
    )

    with course_repo._session_factory() as session:
        after_rows = session.scalars(
            select(AssessmentDB)
            .where(
                AssessmentDB.course_id == stored.course_id,
                AssessmentDB.parent_assessment_id.is_(None),
            )
            .order_by(AssessmentDB.name.asc())
        ).all()
        after_ids = {row.name: row.id for row in after_rows}

    assert after_ids["Midterm"] == before_ids["Midterm"]
    assert after_ids["Final"] == before_ids["Final"]


def test_postgres_planning_alerts_include_overdue_deadlines_from_persisted_data(pg_planning_stack):
    user_repo, course_repo, deadline_repo, _target_repo, planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-overdue@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Overdue Alerts",
            term="W26",
            assessments=[Assessment(name="Assignment 1", weight=40), Assessment(name="Final", weight=60)],
        ),
    )
    deadline_repo.create(
        user_id=user_id,
        course_id=stored.course_id,
        data=DeadlineCreate(
            title="Assignment 1",
            due_date="2026-03-20",
            due_time="09:00",
            assessment_name="Assignment 1",
        ),
    )

    result = planning_service.get_risk_alerts(
        user_id=user_id,
        reference_at=datetime.fromisoformat("2026-03-22T12:00:00-04:00"),
    )

    overdue_alerts = [alert for alert in result["alerts"] if alert["type"] == "overdue_deadline"]
    assert len(overdue_alerts) == 1
    assert overdue_alerts[0]["course_name"] == "Overdue Alerts"
    assert overdue_alerts[0]["assessment_name"] == "Assignment 1"


def test_postgres_planning_alerts_include_near_term_deadlines_from_persisted_data(pg_planning_stack):
    user_repo, course_repo, deadline_repo, _target_repo, planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-nearterm@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Near Term Alerts",
            term="W26",
            assessments=[Assessment(name="Quiz", weight=20), Assessment(name="Final", weight=80)],
        ),
    )
    deadline_repo.create(
        user_id=user_id,
        course_id=stored.course_id,
        data=DeadlineCreate(
            title="Quiz",
            due_date="2026-03-23",
            due_time="10:00",
            assessment_name="Quiz",
        ),
    )

    result = planning_service.get_risk_alerts(
        user_id=user_id,
        reference_at=datetime.fromisoformat("2026-03-22T12:00:00-04:00"),
    )

    near_term_alerts = [alert for alert in result["alerts"] if alert["type"] == "near_term_deadline"]
    assert len(near_term_alerts) == 1
    assert near_term_alerts[0]["course_name"] == "Near Term Alerts"
    assert near_term_alerts[0]["assessment_name"] == "Quiz"


def test_postgres_planning_alerts_use_persisted_targets_for_impossible_target_detection(pg_planning_stack):
    user_repo, course_repo, _deadline_repo, target_repo, planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-target@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Target Alerts",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=60, raw_score=50, total_score=100),
                Assessment(name="Final", weight=40, raw_score=None, total_score=None),
            ],
        ),
    )
    target_repo.set_target(user_id=user_id, course_id=stored.course_id, target_percentage=85)

    result = planning_service.get_risk_alerts(
        user_id=user_id,
        reference_at=datetime.fromisoformat("2026-03-22T12:00:00-04:00"),
    )

    impossible_alerts = [alert for alert in result["alerts"] if alert["type"] == "impossible_target"]
    assert len(impossible_alerts) == 1
    assert impossible_alerts[0]["course_name"] == "Target Alerts"
    assert impossible_alerts[0]["target"] == 85


def test_postgres_planning_alerts_detect_high_weight_ungraded_assessments_from_persisted_scores(pg_planning_stack):
    user_repo, course_repo, _deadline_repo, _target_repo, planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-highweight@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="High Weight Alerts",
            term="W26",
            assessments=[
                Assessment(name="Project", weight=35, raw_score=None, total_score=None),
                Assessment(name="Final", weight=65, raw_score=80, total_score=100),
            ],
        ),
    )

    result = planning_service.get_risk_alerts(
        user_id=user_id,
        reference_at=datetime.fromisoformat("2026-03-22T12:00:00-04:00"),
    )

    high_weight_alerts = [alert for alert in result["alerts"] if alert["type"] == "high_weight_ungraded"]
    assert len(high_weight_alerts) == 1
    assert high_weight_alerts[0]["course_name"] == "High Weight Alerts"
    assert high_weight_alerts[0]["assessment_name"] == "Project"


def test_postgres_saved_scenario_is_read_only_for_real_grades(pg_repos):
    user_repo, course_repo, scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-scenario-safety@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Scenario Safety",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=40, raw_score=78, total_score=100),
                Assessment(name="Final", weight=60, raw_score=None, total_score=None),
            ],
        ),
    )

    course_service = CourseService(course_repo)
    scenario_service = ScenarioService(scenario_repo, course_service)
    before = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)
    assert before is not None

    saved = scenario_service.save_scenario(
        user_id=user_id,
        course_id=stored.course_id,
        name="Final 90",
        entries=[{"assessment_name": "Final", "score": 90}],
    )
    scenario_id = UUID(saved["scenario"]["scenario_id"])

    after_save = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)
    assert after_save is not None
    assert after_save.course.assessments[0].raw_score == before.course.assessments[0].raw_score
    assert after_save.course.assessments[1].raw_score == before.course.assessments[1].raw_score
    assert after_save.course.assessments[1].total_score == before.course.assessments[1].total_score

    result = scenario_service.run_saved_scenario(
        user_id=user_id,
        course_id=stored.course_id,
        scenario_id=scenario_id,
    )
    assert result["mutates_real_grades"] is False

    after_run = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)
    assert after_run is not None
    assert after_run.course.assessments[0].raw_score == before.course.assessments[0].raw_score
    assert after_run.course.assessments[1].raw_score == before.course.assessments[1].raw_score
    assert after_run.course.assessments[1].total_score == before.course.assessments[1].total_score


def test_postgres_deadline_link_uses_stable_assessment_id_after_rename(pg_planning_stack):
    user_repo, course_repo, deadline_repo, _target_repo, _planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-deadline-rename@test.com", password_hash="dummyhash")
    user_id = user.user_id
    deadline_service = DeadlineService(deadline_repo, InMemoryCalendarRepository(), CourseService(course_repo))

    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Deadline Rename Safety",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=40, raw_score=None, total_score=None),
                Assessment(name="Final", weight=60, raw_score=None, total_score=None),
            ],
        ),
    )
    created = deadline_service.create_deadline(
        user_id=user_id,
        course_id=stored.course_id,
        data=DeadlineCreate(
            title="Midterm Due",
            due_date="2026-03-25",
            due_time="10:00",
            assessment_name="Midterm",
        ),
    )
    assert created.assessment_id is not None

    renamed = course_repo.get_by_id(user_id=user_id, course_id=stored.course_id)
    assert renamed is not None
    renamed.course.assessments[0].name = "Midterm Renamed"
    course_repo.update(user_id=user_id, course_id=stored.course_id, course=renamed.course)

    deadlines = deadline_service.list_deadlines(user_id=user_id, course_id=stored.course_id)
    assert len(deadlines) == 1
    assert deadlines[0].assessment_id == created.assessment_id
    assert deadlines[0].assessment_name == "Midterm Renamed"


def test_postgres_deadline_creation_tolerates_unmatched_assessment_name(pg_planning_stack):
    user_repo, course_repo, deadline_repo, _target_repo, _planning_service = pg_planning_stack

    user = user_repo.create_user(email="pg-deadline-unmatched@test.com", password_hash="dummyhash")
    user_id = user.user_id
    deadline_service = DeadlineService(deadline_repo, InMemoryCalendarRepository(), CourseService(course_repo))

    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Deadline Fallback Safety",
            term="W26",
            assessments=[
                Assessment(name="Midterm", weight=40, raw_score=None, total_score=None),
                Assessment(name="Final", weight=60, raw_score=None, total_score=None),
            ],
        ),
    )
    created = deadline_service.create_deadline(
        user_id=user_id,
        course_id=stored.course_id,
        data=DeadlineCreate(
            title="Reading Reflection",
            due_date="2026-03-25",
            due_time="10:00",
            assessment_name="Unmatched Assessment Name",
        ),
    )

    assert created.assessment_id is None
    assert created.assessment_name == "Unmatched Assessment Name"


def test_postgres_duplicate_scenario_entries_fail_without_partial_write(pg_repos):
    user_repo, course_repo, scenario_repo = pg_repos

    user = user_repo.create_user(email="pg-scenario-atomic@test.com", password_hash="dummyhash")
    user_id = user.user_id
    stored = course_repo.create(
        user_id=user_id,
        course=CourseCreate(
            name="Scenario Atomicity",
            term="W26",
            assessments=[
                Assessment(name="Final", weight=100, raw_score=None, total_score=None),
            ],
        ),
    )

    course_service = CourseService(course_repo)
    scenario_service = ScenarioService(scenario_repo, course_service)

    with pytest.raises(ScenarioValidationError, match="Duplicate assessment"):
        scenario_service.save_scenario(
            user_id=user_id,
            course_id=stored.course_id,
            name="Broken Scenario",
            entries=[
                {"assessment_name": "Final", "score": 90},
                {"assessment_name": "Final", "score": 80},
            ],
        )

    stored_scenarios = scenario_repo.list_all(user_id=user_id, course_id=stored.course_id)
    assert stored_scenarios == []
