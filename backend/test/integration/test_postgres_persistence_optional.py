import pytest
import psycopg
from uuid import UUID

from sqlalchemy import text

from app.models import CourseCreate, Assessment
from app.services.course_service import CourseService
from app.services.scenario_service import ScenarioService

assert psycopg is not None, "psycopg is required to run DB persistence tests"

from app.repositories.postgres_user_repo import PostgresUserRepository
from app.repositories.postgres_course_repo import PostgresCourseRepository
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
