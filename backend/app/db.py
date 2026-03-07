import os
from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/evalio"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


class UserDB(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    courses: Mapped[list["CourseDB"]] = relationship(back_populates="user")
    calendar_connections: Mapped[list["CalendarConnectionDB"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class CourseDB(Base):
    __tablename__ = "courses"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    term: Mapped[str | None] = mapped_column(String(32), nullable=True)
    credits: Mapped[float] = mapped_column(Numeric(3, 1), nullable=False, default=3.0, server_default="3.0")
    final_percentage: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    grade_type: Mapped[str] = mapped_column(String(20), nullable=False, default="numeric", server_default="'numeric'")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user: Mapped[UserDB] = relationship(back_populates="courses")
    assessments: Mapped[list["AssessmentDB"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    scenarios: Mapped[list["ScenarioDB"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    deadlines: Mapped[list["DeadlineDB"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    grade_target: Mapped["GradeTargetDB | None"] = relationship(
        back_populates="course", uselist=False, cascade="all, delete-orphan"
    )
    categories: Mapped[list["AssessmentCategoryDB"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class AssessmentDB(Base):
    __tablename__ = "assessments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    parent_assessment_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    category_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("assessment_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    raw_score: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    total_score: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    is_bonus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    course: Mapped[CourseDB] = relationship(back_populates="assessments")
    parent: Mapped["AssessmentDB | None"] = relationship(
        remote_side="AssessmentDB.id", back_populates="children"
    )
    children: Mapped[list["AssessmentDB"]] = relationship(back_populates="parent")
    category: Mapped["AssessmentCategoryDB | None"] = relationship(back_populates="assessments")
    rule: Mapped["RuleDB | None"] = relationship(
        back_populates="assessment", uselist=False, cascade="all, delete-orphan"
    )
    scenario_scores: Mapped[list["ScenarioScoreDB"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


class RuleDB(Base):
    __tablename__ = "rules"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    assessment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    rule_config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    assessment: Mapped[AssessmentDB] = relationship(back_populates="rule")


class ScenarioDB(Base):
    __tablename__ = "scenarios"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    course: Mapped[CourseDB] = relationship(back_populates="scenarios")
    scores: Mapped[list["ScenarioScoreDB"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )


class ScenarioScoreDB(Base):
    __tablename__ = "scenario_scores"
    __table_args__ = (UniqueConstraint("scenario_id", "assessment_id", name="uq_scenario_scores_pair"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    scenario_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assessment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    simulated_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    scenario: Mapped[ScenarioDB] = relationship(back_populates="scores")
    assessment: Mapped[AssessmentDB] = relationship(back_populates="scenario_scores")


class DeadlineDB(Base):
    __tablename__ = "deadlines"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_time: Mapped[time | None] = mapped_column(nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    exported_to_gcal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    gcal_event_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    course: Mapped[CourseDB] = relationship(back_populates="deadlines")
    exports: Mapped[list["DeadlineExportDB"]] = relationship(
        back_populates="deadline", cascade="all, delete-orphan"
    )


class CalendarConnectionDB(Base):
    """Google Calendar (or other provider) OAuth connections per user."""
    __tablename__ = "calendar_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_calendar_connection_user_provider"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. 'google'
    calendar_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_connected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False),
        nullable=True,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped[UserDB] = relationship(back_populates="calendar_connections")
    deadline_exports: Mapped[list["DeadlineExportDB"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan"
    )


class GradeTargetDB(Base):
    """User-defined target grade for a course (one per course)."""
    __tablename__ = "grade_targets"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    target_percentage: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    course: Mapped[CourseDB] = relationship(back_populates="grade_target")


class AssessmentCategoryDB(Base):
    """Optional grouping of assessments by category (e.g., 'Assignments', 'Exams')."""
    __tablename__ = "assessment_categories"
    __table_args__ = (UniqueConstraint("course_id", "name", name="uq_assessment_category_course_name"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    course_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    weight: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    course: Mapped[CourseDB] = relationship(back_populates="categories")
    assessments: Mapped[list["AssessmentDB"]] = relationship(back_populates="category")


class DeadlineExportDB(Base):
    """Tracks which deadlines have been exported to external calendars."""
    __tablename__ = "deadline_exports"
    __table_args__ = (
        UniqueConstraint("deadline_id", "connection_id", "provider", name="uq_deadline_export_unique"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    deadline_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("deadlines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    connection_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("calendar_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. 'google'
    external_event_id: Mapped[str] = mapped_column(Text, nullable=False)
    exported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    deadline: Mapped[DeadlineDB] = relationship(back_populates="exports")
    connection: Mapped[CalendarConnectionDB] = relationship(back_populates="deadline_exports")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_deadlines_due_date_column()
    _ensure_rules_rule_type_constraint()


def _ensure_deadlines_due_date_column() -> None:
    # Backward compatibility for older DBs that still have deadlines.due_at.
    if engine.dialect.name != "postgresql":
        return

    ddl = """
DO $$
DECLARE
    due_at_exists BOOLEAN := FALSE;
    due_date_exists BOOLEAN := FALSE;
    due_date_type TEXT := NULL;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'deadlines'
    ) THEN
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'deadlines' AND column_name = 'due_at'
        ) INTO due_at_exists;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'deadlines' AND column_name = 'due_date'
        ) INTO due_date_exists;

        IF due_at_exists AND NOT due_date_exists THEN
            ALTER TABLE deadlines RENAME COLUMN due_at TO due_date;
            due_date_exists := TRUE;
        END IF;

        IF due_date_exists THEN
            SELECT data_type
            INTO due_date_type
            FROM information_schema.columns
            WHERE table_name = 'deadlines' AND column_name = 'due_date'
            LIMIT 1;

            IF due_date_type IS DISTINCT FROM 'date' THEN
                ALTER TABLE deadlines
                ALTER COLUMN due_date TYPE DATE
                USING due_date::date;
            END IF;
        END IF;
    END IF;
END
$$;
"""
    with engine.begin() as connection:
        connection.execute(text(ddl))


def _ensure_rules_rule_type_constraint() -> None:
    # Keep DB constraint aligned with extraction/backend rule types.
    if engine.dialect.name != "postgresql":
        return

    ddl = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'rules'
    ) THEN
        ALTER TABLE rules
        DROP CONSTRAINT IF EXISTS rules_rule_type_check;

        ALTER TABLE rules
        ADD CONSTRAINT rules_rule_type_check
        CHECK (
            rule_type IN (
                'pure_multiplicative',
                'best_of',
                'drop_lowest',
                'mandatory_pass'
            )
        );
    END IF;
END
$$;
"""
    with engine.begin() as connection:
        connection.execute(text(ddl))
