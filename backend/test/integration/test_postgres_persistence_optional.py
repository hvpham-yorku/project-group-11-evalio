import os
import pytest
from uuid import UUID

from app.models import CourseCreate, Assessment
from app.services.course_service import CourseService
from app.services.scenario_service import ScenarioService

RUN = os.getenv("EVALIO_RUN_POSTGRES_TESTS") == "1"

if RUN:
    pytest.importorskip("psycopg", reason="Postgres integration tests require psycopg/libpq.")
    from app.repositories.postgres_user_repo import PostgresUserRepository
    from app.repositories.postgres_course_repo import PostgresCourseRepository
    from app.repositories.postgres_scenario_repo import PostgresScenarioRepository
else:
    pytestmark = pytest.mark.skip(
        reason="Postgres integration tests disabled. Set EVALIO_RUN_POSTGRES_TESTS=1 to run."
    )


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
