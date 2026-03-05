-- Enable UUID generation (so PostgreSQL can create IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- COURSES TABLE
-- Stores each course that user creates or extracts
-- Updated for GPA Converter (User Story 3)

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- Unique course ID

    name VARCHAR(255) NOT NULL,                      -- Course name

	-- Semester/term the course belongs to
    term VARCHAR(20) NOT NULL,                       -- Example: Fall2025, Winter2026

    -- Credit value for weighted GPA calculations
    credits DECIMAL(3,1) NOT NULL DEFAULT 3.0,

    -- Final percentage grade for the course
    -- Used by GPA converter (percentage → GPA)
    final_percentage DECIMAL(5,2)
    CHECK (final_percentage >= 0 AND final_percentage <= 100),

    -- Handles non-numeric grades
    -- Example: pass / withdrawn courses
    grade_type VARCHAR(20) DEFAULT 'numeric'
    CHECK (grade_type IN ('numeric','pass','fail','withdrawn')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- When it was created
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ASSESSMENTS TABLE
-- Stores assessments (midterm, quiz, etc.)
-- Each assessment belongs to one course
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- Unique assessment ID
    
    course_id UUID NOT NULL,                         -- Which course it belongs to
    
    name VARCHAR(255) NOT NULL,                      -- Assessment name
    weight DECIMAL(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),  
    -- Weight must be between 0 and 100
    
    -- Foreign key ensures relational integrity
    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
        -- If a course is deleted, its assessments are deleted automatically
);

-- SCORES TABLE
-- Stores actual grades entered by student

CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    assessment_id UUID UNIQUE NOT NULL,

    score DECIMAL(5,2) CHECK (score >= 0 AND score <= 100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (assessment_id)
        REFERENCES assessments(id)
        ON DELETE CASCADE
);


-- RULES TABLE
-- Stores grading rules (best-of, drop lowest, etc.)
-- Uses JSONB for flexible rule storage
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- Unique rule ID
    
    course_id UUID NOT NULL,                         -- Which course it belongs to
    
    rule_type VARCHAR(100) NOT NULL,                 -- Type of rule
    rule_config JSONB NOT NULL,                      -- Rule details (stored as JSON)
    
    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);

-- SCENARIOS TABLE
-- Stores What-If scenarios

CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    course_id UUID NOT NULL,

    name VARCHAR(255) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE
);

-- SCENARIO SCORES TABLE
-- Stores hypothetical scores inside a scenario

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

--  INDEXES
-- Makes course lookups faster
CREATE INDEX idx_assessments_course_id
ON assessments(course_id);

CREATE INDEX idx_rules_course_id
ON rules(course_id);

-- INDEXES FOR PERFORMANCE

CREATE INDEX idx_scores_assessment_id
ON scores(assessment_id);

CREATE INDEX idx_scenarios_course_id
ON scenarios(course_id);

-- GPA converter indexes

CREATE INDEX idx_courses_term
ON courses(term);

CREATE INDEX idx_courses_grade_type
ON courses(grade_type);

-- just to test (ignore)

--DROP TABLE IF EXISTS scenario_scores CASCADE;
--DROP TABLE IF EXISTS scenarios CASCADE;
--DROP TABLE IF EXISTS scores CASCADE;
--DROP TABLE IF EXISTS assessments CASCADE;
--DROP TABLE IF EXISTS rules CASCADE;
--DROP TABLE IF EXISTS courses CASCADE;

--SELECT column_name
--FROM information_schema.columns
--WHERE table_name = 'courses'
--ORDER BY ordinal_position;

--SELECT table_name
--FROM information_schema.tables
--WHERE table_schema = 'public';

--INSERT INTO courses (name, term, credits, final_percentage)
--VALUES ('EECS2311', 'Fall2025', 3.0, 82);

--SELECT * FROM courses;

--INSERT INTO courses (name, term, final_percentage)
--VALUES ('BadCourse', 'Fall2025', 150);

--INSERT INTO courses (name, term, credits, final_percentage)
--VALUES ('EECS2311', 'Fall2025', 3.0, 82);

--INSERT INTO courses (name, term, grade_type)
--VALUES ('Internship', 'Winter2026', 'pass');

--TRUNCATE TABLE 
--scenario_scores,
--scenarios,
--scores,
--assessments,
--rules,
--courses
--RESTART IDENTITY CASCADE;

