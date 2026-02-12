import pytest
from app.routes import courses

@pytest.fixture(autouse=True)
def clear_courses_db():
    courses.courses_db.clear()
    yield
    courses.courses_db.clear()
