-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- CALENDAR CONNECTIONS
CREATE TABLE calendar_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL,

    provider VARCHAR(20) NOT NULL
        CHECK (provider IN ('google')),

    calendar_id TEXT,

    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,

    is_connected BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    UNIQUE (user_id, provider)
);

CREATE INDEX idx_calendar_connections_user
ON calendar_connections(user_id);



-- COURSES
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    user_id UUID NOT NULL,

    name VARCHAR(255) NOT NULL,

    term VARCHAR(20) NOT NULL,

    credits DECIMAL(3,1) NOT NULL DEFAULT 3.0,

    final_percentage DECIMAL(5,2)
        CHECK (final_percentage >= 0 AND final_percentage <= 100),

    grade_type VARCHAR(20) DEFAULT 'numeric'
        CHECK (grade_type IN ('numeric','pass','fail','withdrawn')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_courses_term
ON courses(term);

CREATE INDEX idx_courses_grade_type
ON courses(grade_type);


-- DEADLINES
CREATE TABLE deadlines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    title VARCHAR(255) NOT NULL,

    due_date DATE NOT NULL,
    due_time TIME,

    source VARCHAR(20) NOT NULL
        CHECK (source IN ('manual','outline')),

    notes TEXT,

    assessment_name TEXT,

    exported_to_gcal BOOLEAN DEFAULT FALSE,

    gcal_event_id TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);

ALTER TABLE deadlines
ADD CONSTRAINT unique_deadline_per_course
UNIQUE (course_id, title, due_date);

CREATE INDEX idx_deadlines_course_id
ON deadlines(course_id);

CREATE INDEX idx_deadlines_due_date
ON deadlines(due_date);



-- DEADLINE EXPORTS
CREATE TABLE deadline_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    deadline_id UUID NOT NULL,
    connection_id UUID NOT NULL,

    provider VARCHAR(20) NOT NULL
        CHECK (provider IN ('google')),

    external_event_id TEXT NOT NULL,

    exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (deadline_id)
        REFERENCES deadlines(id)
        ON DELETE CASCADE,

    FOREIGN KEY (connection_id)
        REFERENCES calendar_connections(id)
        ON DELETE CASCADE,

    UNIQUE (deadline_id, connection_id, provider)
);

CREATE INDEX idx_deadline_exports_deadline
ON deadline_exports(deadline_id);



-- ASSESSMENT CATEGORIES
CREATE TABLE assessment_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    name VARCHAR(100) NOT NULL,

    weight DECIMAL(5,2)
        CHECK (weight >= 0 AND weight <= 100),

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    UNIQUE (course_id, name)
);

CREATE INDEX idx_assessment_categories_course_id
ON assessment_categories(course_id);



-- ASSESSMENTS
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    parent_assessment_id UUID,

    category_id UUID,

    name VARCHAR(255) NOT NULL,

    weight DECIMAL(5,2)
        CHECK (weight > 0 AND weight <= 100),

    raw_score DECIMAL(6,2),
    total_score DECIMAL(6,2),

    is_bonus BOOLEAN NOT NULL DEFAULT FALSE,

    position INTEGER NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (parent_assessment_id)
        REFERENCES assessments(id)
        ON DELETE CASCADE,

    FOREIGN KEY (category_id)
        REFERENCES assessment_categories(id)
        ON DELETE SET NULL,

    UNIQUE (course_id, name)
);

ALTER TABLE assessments
ADD CONSTRAINT unique_assessment_order
UNIQUE (course_id, parent_assessment_id, position);

CREATE INDEX idx_assessments_course_id
ON assessments(course_id);

CREATE INDEX idx_assessments_parent
ON assessments(parent_assessment_id);

CREATE INDEX idx_assessments_category_id
ON assessments(category_id);



-- RULES
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    assessment_id UUID NOT NULL,

    rule_type VARCHAR(50) NOT NULL,

    rule_config JSONB NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (assessment_id)
        REFERENCES assessments(id)
        ON DELETE CASCADE,

    UNIQUE (assessment_id),

    CHECK (rule_type IN (
        'pure_multiplicative',
        'best_of',
        'drop_lowest',
        'mandatory_pass'
    ))
);

CREATE INDEX idx_rules_assessment_id
ON rules(assessment_id);



-- TARGET GRADES
CREATE TABLE grade_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    target_percentage DECIMAL(5,2)
        CHECK (target_percentage >= 0 AND target_percentage <= 100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE,

    UNIQUE (course_id)
);

CREATE INDEX idx_grade_targets_course_id
ON grade_targets(course_id);



-- SCENARIOS
CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    name VARCHAR(255) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_scenarios_course_id
ON scenarios(course_id);



-- SCENARIO SCORES
CREATE TABLE scenario_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    scenario_id UUID NOT NULL,
    assessment_id UUID NOT NULL,

    simulated_score DECIMAL(5,2),

    FOREIGN KEY (scenario_id)
        REFERENCES scenarios(id)
        ON DELETE CASCADE,

    FOREIGN KEY (assessment_id)
        REFERENCES assessments(id)
        ON DELETE CASCADE,

    UNIQUE (scenario_id, assessment_id)
);
